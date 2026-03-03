import { forwardRef, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { EditorService } from "~/lib/application/EditorService";
import { EditorProvider, useEditor } from "./core/EditorContext";
import { ContentEditableRoot } from "./core/ContentEditableRoot";
import { Toolbar } from "./Toolbar";
import { renderDocument } from "./DocumentRenderer";
import type { AssetRef } from "~/lib/domain/document/entities/Image";
import type { HeaderFooterContent } from "~/lib/domain/document/value-objects/SectionLayout";
import { applySelectionFromOffsets } from "./core/domSelection";
import { ImageResizePlugin } from "./plugins/ImageResizePlugin";
import { TablePlugin } from "./plugins/TablePlugin";
import { DebugPanel } from "./DebugPanel";
import { HeaderFooter } from "./HeaderFooter";
import { exportToPdf } from "~/lib/export/PdfExporter";
import { DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT } from "~/lib/domain/layout/PaginationTypes";
import { usePageLayout, getContentAreaHeight } from "./hooks/usePageLayout";

/**
 * Binary-search for the last character offset within `el` whose rendered
 * bottom is at or before `targetY` (relative to root's border-box top).
 */
function findSplitOffset(
  el: HTMLElement,
  targetY: number,
  rootTop: number,
): { node: Text; offset: number } | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let best: { node: Text; offset: number } | null = null;

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    const len = textNode.length;
    let lo = 0;
    let hi = len;
    let nodeBest = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      range.setStart(textNode, 0);
      range.setEnd(textNode, mid);
      const rects = range.getClientRects();
      const last = rects.length > 0 ? rects[rects.length - 1] : null;
      if (last && last.bottom - rootTop <= targetY + 0.5) {
        nodeBest = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (nodeBest >= 0) {
      best = { node: textNode, offset: nodeBest };
    }
    if (nodeBest < len) break;
  }

  return best;
}

function createSpacer(height: number): HTMLElement {
  const spacer = document.createElement("div");
  spacer.setAttribute("data-page-break", "true");
  spacer.setAttribute("contenteditable", "false");
  spacer.style.height = `${height}px`;
  spacer.style.display = "block";
  spacer.style.pointerEvents = "none";
  spacer.style.userSelect = "none";
  return spacer;
}

/**
 * Inserts invisible spacer divs into the content root so that block-level
 * children never straddle two visual pages. When a block is taller than
 * one page's content area and starts at a page boundary, we split the DOM
 * element at the exact line where the page break falls and insert a spacer
 * between the two halves. This is done iteratively until no block overflows.
 *
 * Coordinate model (all values relative to root's border-box top):
 *   - Page N's content area spans:
 *       contentStart = headerHeight + (N-1) * stride
 *       contentEnd   = contentStart + contentH
 *     where contentH = pageHeightPx - headerHeight - footerHeight
 *     and   stride   = contentH + footerHeight + gapPx + headerHeight.
 */
let _applyingPageBreaks = false;

function applyPageBreaks(
  root: HTMLElement,
  pageHeightPx: number,
  headerHeight: number,
  footerHeight: number,
  gapPx: number,
): number {
  if (_applyingPageBreaks) return -1;
  _applyingPageBreaks = true;

  try {
    return _applyPageBreaksInner(root, pageHeightPx, headerHeight, footerHeight, gapPx);
  } finally {
    _applyingPageBreaks = false;
  }
}

function _applyPageBreaksInner(
  root: HTMLElement,
  pageHeightPx: number,
  headerHeight: number,
  footerHeight: number,
  gapPx: number,
): number {
  const contentH = pageHeightPx - headerHeight - footerHeight;
  if (contentH <= 0) return 1;

  root.querySelectorAll('[data-page-break="true"]').forEach((s) => s.remove());

  const continuations = Array.from(root.querySelectorAll('[data-page-continuation]')) as HTMLElement[];
  for (const cont of continuations) {
    const prevBlock = cont.previousElementSibling as HTMLElement | null;
    if (prevBlock) {
      while (cont.firstChild) prevBlock.appendChild(cont.firstChild);
    }
    cont.remove();
  }

  const transitionH = footerHeight + gapPx + headerHeight;
  const stride = contentH + transitionH;

  for (let pass = 0; pass < 200; pass++) {
    const children = Array.from(root.children).filter(
      (el) => el.getAttribute("data-page-break") !== "true",
    ) as HTMLElement[];

    const rootTop = root.getBoundingClientRect().top;
    let pageIdx = 0;
    let needsAnotherPass = false;

    for (const child of children) {
      const rect = child.getBoundingClientRect();
      const childTop = rect.top - rootTop;
      const childBottom = rect.bottom - rootTop;

      let contentStart = headerHeight + pageIdx * stride;
      let contentEnd = contentStart + contentH;

      while (childTop >= contentEnd - 0.5) {
        pageIdx++;
        contentStart = headerHeight + pageIdx * stride;
        contentEnd = contentStart + contentH;
      }

      if (childBottom <= contentEnd + 0.5) continue;

      const atPageStart = childTop <= contentStart + 1;

      if (!atPageStart) {
        const gap = contentEnd - childTop;
        const h = Math.max(0, gap) + transitionH;
        root.insertBefore(createSpacer(h), child);
        needsAnotherPass = true;
        break;
      }

      const bp = findSplitOffset(child, contentEnd, rootTop);
      if (!bp || bp.offset === 0) {
        pageIdx++;
        continue;
      }

      const afterRange = document.createRange();
      afterRange.setStart(bp.node, bp.offset);
      afterRange.setEndAfter(child.lastChild || child);
      const fragment = afterRange.extractContents();

      const continuation = document.createElement(child.tagName.toLowerCase());
      continuation.setAttribute("data-page-continuation", "true");
      continuation.className = child.className;
      const copiedStyle = child.getAttribute("style");
      if (copiedStyle) continuation.setAttribute("style", copiedStyle);
      continuation.appendChild(fragment);

      const remaining = contentEnd - (child.getBoundingClientRect().bottom - rootTop);
      const spacerH = Math.max(0, remaining) + transitionH;

      child.after(createSpacer(spacerH), continuation);
      needsAnotherPass = true;
      break;
    }

    if (!needsAnotherPass) break;
  }

  let pageCount = 1;
  const rootTop = root.getBoundingClientRect().top;
  const allContent = Array.from(root.children).filter(
    (el) => el.getAttribute("data-page-break") !== "true",
  );
  for (const el of allContent) {
    const top = (el as HTMLElement).getBoundingClientRect().top - rootTop;
    const pg = Math.floor((top - headerHeight + 0.5) / stride) + 1;
    if (pg > pageCount) pageCount = pg;
  }

  return pageCount;
}

function assetToDataUrl(asset: AssetRef | null): string | null {
  if (!asset?.bytes?.length) return null;
  try {
    const mime = asset.name.toLowerCase().endsWith(".png") ? "image/png" :
      asset.name.toLowerCase().endsWith(".gif") ? "image/gif" :
      asset.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
    const base64 = btoa(String.fromCharCode(...asset.bytes));
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

const ImageInput = forwardRef<
  HTMLInputElement,
  { onImageSelect: (asset: AssetRef) => void }
>(function ImageInput({ onImageSelect }, ref) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const bytes = Array.from(
          new Uint8Array(
            atob(dataUrl.split(",")[1] ?? "")
              .split("")
              .map((c) => c.charCodeAt(0)),
          ),
        );
        const asset: AssetRef = {
          name: file.name,
          targetPos: 0,
          alt: file.name,
          size: [0, 0],
          bytes,
        };
        onImageSelect(asset);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onImageSelect],
  );

  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleChange}
    />
  );
});

function EditorFooter({
  currentPage,
  pageCount,
  service,
}: {
  currentPage: number;
  pageCount: number;
  service: EditorService;
}) {
  const editor = useEditor();
  const charCount = useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => editor?.getTextContent().length ?? 0,
    () => editor?.getTextContent().length ?? 0,
  );
  return (
    <div className="flex items-center justify-between text-xs text-zinc-500">
      <span>{`Page ${currentPage} of ${pageCount}`}</span>
      <span>{charCount} characters</span>
    </div>
  );
}

function EditorImageInputInner(
  { setAssets }: { setAssets: React.Dispatch<React.SetStateAction<AssetRef[]>> },
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const editor = useEditor();
  const onImageSelect = useCallback(
    (asset: AssetRef) => {
      flushSync(() => {
        setAssets((prev) => [...prev, asset]);
      });
      editor?.insertImage(asset);
    },
    [editor, setAssets],
  );
  return <ImageInput ref={ref} onImageSelect={onImageSelect} />;
}

const EditorImageInput = forwardRef<HTMLInputElement, { setAssets: React.Dispatch<React.SetStateAction<AssetRef[]>> }>(
  EditorImageInputInner,
);

export function EditorShell() {
  const [service] = useState(() => {
    const s = new EditorService();
    s.newDocument();
    return s;
  });

  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [pageWidthPx, setPageWidthPx] = useState(DEFAULT_PAGE_WIDTH);
  const [pageHeightPx, setPageHeightPx] = useState(DEFAULT_PAGE_HEIGHT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [headerContent, setHeaderContent] = useState<HeaderFooterContent | undefined>();
  const [footerContent, setFooterContent] = useState<HeaderFooterContent | undefined>();
  const paginatedContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const {
    config: pageLayoutConfig,
    headerRef,
    footerRef,
    contentTopPadding,
    contentBottomPadding,
    updatePageSize,
  } = usePageLayout(pageWidthPx, pageHeightPx);

  const getAssetDataUrl = useCallback((name: string): string | null => {
    const asset = assets.find((a) => a.name === name);
    return assetToDataUrl(asset ?? null);
  }, [assets]);

  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onExportPdf = useCallback(() => {
    const doc = service.getDocument();
    if (doc) {
      const snapshot = doc.toSnapshot();
      const assetMap = new Map<string, string>();
      for (const asset of assets) {
        const dataUrl = assetToDataUrl(asset);
        if (dataUrl) {
          assetMap.set(asset.name, dataUrl);
        }
      }
      exportToPdf(snapshot, assetMap);
    }
  }, [service, assets]);

  const handleHeaderChange = useCallback((content: HeaderFooterContent) => {
    setHeaderContent(content.left || content.center || content.right ? content : undefined);
    service.setHeader(content);
  }, [service]);

  const handleFooterChange = useCallback((content: HeaderFooterContent) => {
    setFooterContent(content.left || content.center || content.right ? content : undefined);
    service.setFooter(content);
  }, [service]);

  useEffect(() => {
    updatePageSize(pageWidthPx, pageHeightPx);
  }, [pageWidthPx, pageHeightPx, updatePageSize]);

  useEffect(() => {
    let rafId: number | null = null;

    const render = () => {
      const root = rootRef.current;
      const doc = service.getDocument();
      if (!root || !doc) return;

      if (!service.selection && doc.getText().length === 0) {
        service.setSelectionFromOffsets(0, 0);
      }
      const hadSelection = service.selection;
      renderDocument(root, doc, getAssetDataUrl);

      if (hadSelection) {
        const offsets = service.selection;
        if (offsets) {
          const block = doc.getBlock(offsets.anchor.blockId);
          if (block) {
            const range = doc.getBlockRange(offsets.anchor.blockId);
            if (range) {
              const anchor = range.start + offsets.anchor.offset;
              const focus = range.start + offsets.focus.offset;
              applySelectionFromOffsets(root, anchor, focus);
            }
          }
        }
        root.focus();
      }

      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const newPageCount = applyPageBreaks(
          root,
          pageHeightPx,
          contentTopPadding,
          contentBottomPadding,
          pageLayoutConfig.gapPx,
        );
        if (newPageCount > 0) setPageCount(newPageCount);
      });
    };

    const unsub = service.subscribe(render);
    render();
    return () => {
      unsub();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [service, getAssetDataUrl, pageHeightPx, contentTopPadding, contentBottomPadding, pageLayoutConfig.gapPx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        console.log("Document saved");
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const doc = service.getDocument();
        if (doc) {
          const snapshot = doc.toSnapshot();
          const assetMap = new Map<string, string>();
          for (const asset of assets) {
            const dataUrl = assetToDataUrl(asset);
            if (dataUrl) {
              assetMap.set(asset.name, dataUrl);
            }
          }
          exportToPdf(snapshot, assetMap);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [service, assets]);

  useEffect(() => {
    const container = paginatedContainerRef.current;
    if (!container) return;

    const updateScrollPosition = () => {
      if (!container) return;

      const scrollTop = container.scrollTop;
      const pageHeight = pageHeightPx + pageLayoutConfig.gapPx;
      const newPage = Math.max(1, Math.min(pageCount, Math.floor(scrollTop / pageHeight) + 1));
      setCurrentPage((prev) => (prev === newPage ? prev : newPage));
    };

    const THROTTLE_MS = 100;
    let throttleId: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;
    const throttledUpdate = () => {
      const now = Date.now();
      if (now - lastRun >= THROTTLE_MS) {
        lastRun = now;
        updateScrollPosition();
      } else if (!throttleId) {
        throttleId = setTimeout(() => {
          throttleId = null;
          lastRun = Date.now();
          updateScrollPosition();
        }, THROTTLE_MS - (now - lastRun));
      }
    };

    updateScrollPosition();

    container.addEventListener("scroll", throttledUpdate);

    return () => {
      container.removeEventListener("scroll", throttledUpdate);
      if (throttleId) clearTimeout(throttleId);
    };
  }, [pageHeightPx, pageCount, pageLayoutConfig.gapPx]);

  const contentAreaHeight = getContentAreaHeight(pageLayoutConfig);
  const totalPageHeight = pageHeightPx + pageLayoutConfig.gapPx;

  return (
    <EditorProvider service={service} rootRef={rootRef}>
      <ImageResizePlugin />
      <TablePlugin />
      <main className="mx-auto flex h-screen max-w-[100vw] flex gap-0 p-4 text-zinc-900">
        <div className="flex flex-1 flex-col gap-3">
          <Toolbar
            onInsertImage={onInsertImage}
            onExportPdf={onExportPdf}
            pageWidthPx={pageWidthPx}
            pageHeightPx={pageHeightPx}
            onPageWidthChange={setPageWidthPx}
            onPageHeightChange={setPageHeightPx}
            showDebugPanel={showDebugPanel}
            onToggleDebugPanel={() => setShowDebugPanel((p) => !p)}
          />

          <div className="flex-1 overflow-hidden">
            <div
              ref={paginatedContainerRef}
              className="h-full overflow-auto bg-zinc-300"
              data-testid="editor-scroll-container"
            >
              <div className="sticky top-3 z-20 mx-auto w-fit rounded-full border border-zinc-300 bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
                Page {currentPage} / {Math.max(pageCount, 1)}
              </div>

              <div className="flex flex-col items-center pt-4 pb-8 px-4">
                <div
                  className="relative"
                  style={{
                    width: pageWidthPx,
                  }}
                >
                  {Array.from({ length: Math.max(1, pageCount) }, (_, i) => (
                    <div
                      key={`page-bg-${i}`}
                      className="bg-white shadow-lg absolute"
                      style={{
                        top: i * totalPageHeight,
                        left: 0,
                        right: 0,
                        height: pageHeightPx,
                        zIndex: 0,
                      }}
                    />
                  ))}

                  <div
                    className="relative"
                    style={{
                      minHeight: pageCount * pageHeightPx + (pageCount - 1) * pageLayoutConfig.gapPx,
                      zIndex: 1,
                    }}
                  >
                    <ContentEditableRoot
                      className="editor-content paged outline-none"
                      style={{
                        minHeight: contentAreaHeight,
                        paddingTop: contentTopPadding,
                        paddingBottom: contentBottomPadding,
                        paddingLeft: 48,
                        paddingRight: 48,
                      }}
                      getAssetDataUrl={getAssetDataUrl}
                      data-testid="editor-content"
                    />
                  </div>

                  {Array.from({ length: Math.max(1, pageCount) }, (_, i) => (
                    <div
                      key={`page-hf-${i}`}
                      className="absolute left-0 right-0 pointer-events-none"
                      style={{
                        top: i * totalPageHeight,
                        height: pageHeightPx,
                        zIndex: 10,
                      }}
                    >
                      <div className="absolute left-0 right-0 pointer-events-auto" style={{ top: 0 }}>
                        <HeaderFooter
                          ref={i === 0 ? headerRef : undefined}
                          type="header"
                          content={headerContent}
                          pageNumber={i + 1}
                          totalPages={pageCount}
                          pageWidth={pageWidthPx}
                          onContentChange={handleHeaderChange}
                        />
                      </div>
                      <div className="absolute left-0 right-0 pointer-events-auto" style={{ bottom: 0 }}>
                        <HeaderFooter
                          ref={i === 0 ? footerRef : undefined}
                          type="footer"
                          content={footerContent}
                          pageNumber={i + 1}
                          totalPages={pageCount}
                          pageWidth={pageWidthPx}
                          onContentChange={handleFooterChange}
                        />
                      </div>
                    </div>
                  ))}

                  {Array.from({ length: Math.max(1, pageCount - 1) }, (_, i) => (
                    <div
                      key={`page-gap-${i}`}
                      className="absolute pointer-events-none bg-zinc-300"
                      style={{
                        top: (i + 1) * pageHeightPx + i * pageLayoutConfig.gapPx,
                        left: 0,
                        right: 0,
                        height: pageLayoutConfig.gapPx,
                        zIndex: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <EditorFooter currentPage={currentPage} pageCount={pageCount} service={service} />

          <EditorImageInput
            ref={fileInputRef}
            setAssets={setAssets}
          />
        </div>

        {showDebugPanel && <DebugPanel service={service} />}
      </main>
    </EditorProvider>
  );
}

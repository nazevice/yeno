import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { EditorService } from "~/lib/application/EditorService";
import { EditorProvider, useEditor } from "./core/EditorContext";
import { ContentEditableRoot } from "./core/ContentEditableRoot";
import { Toolbar } from "./Toolbar";
import { renderDocument } from "./DocumentRenderer";
import type { AssetRef } from "~/lib/domain/document/entities/Image";
import { createRangeFromOffsets } from "./core/domSelection";
import { ImageResizePlugin } from "./plugins/ImageResizePlugin";
import { TablePlugin } from "./plugins/TablePlugin";
import { DebugPanel } from "./DebugPanel";

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

const DEFAULT_PAGE_WIDTH = 794;
const DEFAULT_PAGE_HEIGHT = 1123;
const PAGE_GAP_PX = 48;

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
  const paginatedContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const getAssetDataUrl = useCallback((name: string): string | null => {
    const asset = assets.find((a) => a.name === name);
    return assetToDataUrl(asset ?? null);
  }, [assets]);

  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
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
              const domRange = createRangeFromOffsets(root, anchor, focus);
              if (domRange) {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(domRange);
              }
            }
          }
        }
        root.focus();
      }
    };

    const unsub = service.subscribe(render);
    render();
    return unsub;
  }, [service, getAssetDataUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        console.log("Document saved");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const container = paginatedContainerRef.current;
    const editable = document.querySelector<HTMLElement>(".editor-content.paged");
    if (!container || !editable) return;

    const updatePaginationStats = () => {
      const pageStridePx = pageHeightPx + PAGE_GAP_PX;
      const computedPageCount = Math.max(1, Math.ceil(editable.scrollHeight / pageStridePx));
      setPageCount(computedPageCount);

      const selection = window.getSelection();
      let cursorY = container.scrollTop;
      if (selection && selection.rangeCount > 0) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.height || rect.width) {
          cursorY = container.scrollTop + Math.max(0, rect.top - containerRect.top);
        }
      }

      const nextPage = Math.max(
        1,
        Math.min(computedPageCount, Math.floor(cursorY / pageStridePx) + 1),
      );
      setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
    };

    const THROTTLE_MS = 100;
    let throttleId: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;
    const throttledUpdate = () => {
      const now = Date.now();
      if (now - lastRun >= THROTTLE_MS) {
        lastRun = now;
        updatePaginationStats();
      } else if (!throttleId) {
        throttleId = setTimeout(() => {
          throttleId = null;
          lastRun = Date.now();
          updatePaginationStats();
        }, THROTTLE_MS - (now - lastRun));
      }
    };

    updatePaginationStats();
    const ro = new ResizeObserver(throttledUpdate);
    ro.observe(editable);
    container.addEventListener("scroll", throttledUpdate);
    document.addEventListener("selectionchange", throttledUpdate);

    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", throttledUpdate);
      document.removeEventListener("selectionchange", throttledUpdate);
      if (throttleId) clearTimeout(throttleId);
    };
  }, [pageHeightPx]);

  const contentEditableStylePaginated = useMemo(
    () => ({ minHeight: pageHeightPx - 96 }),
    [pageHeightPx],
  );


  return (
    <EditorProvider service={service} rootRef={rootRef}>
      <ImageResizePlugin />
      <TablePlugin />
      <main className="mx-auto flex h-screen max-w-[100vw] flex gap-0 p-4 text-zinc-900">
        <div className="flex flex-1 flex-col gap-3">
          <Toolbar
            onInsertImage={onInsertImage}
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
              className="h-full overflow-auto bg-zinc-100"
              data-testid="editor-scroll-container"
            >
              <div
                className="mx-auto bg-white shadow-lg"
                style={{ width: pageWidthPx, minHeight: pageHeightPx }}
              >
                <ContentEditableRoot
                  className="editor-content paged p-12 outline-none"
                  style={contentEditableStylePaginated}
                  getAssetDataUrl={getAssetDataUrl}
                  data-testid="editor-content"
                />
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

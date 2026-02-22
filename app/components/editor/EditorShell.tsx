import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorService } from "~/lib/application/EditorService";
import { EditorProvider } from "./core/EditorContext";
import { ContentEditableRoot } from "./core/ContentEditableRoot";
import { Toolbar } from "./Toolbar";
import { renderDocument } from "./DocumentRenderer";
import type { AssetRef } from "~/lib/domain/document/entities/Image";
import { TextAttributes } from "~/lib/domain/document/value-objects/TextAttributes";
import { createRangeFromOffsets } from "./core/domSelection";
import { parseFontSizePx } from "~/lib/doc/fonts";

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

export function EditorShell() {
  const serviceRef = useRef<EditorService | null>(null);
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [pageWidthPx, setPageWidthPx] = useState(DEFAULT_PAGE_WIDTH);
  const [pageHeightPx, setPageHeightPx] = useState(DEFAULT_PAGE_HEIGHT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const paginatedContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  
  if (!serviceRef.current) {
    serviceRef.current = new EditorService();
    serviceRef.current.newDocument();
  }
  const service = serviceRef.current;

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
    const updatePaginationStats = () => {
      const container = paginatedContainerRef.current;
      const editable = document.querySelector<HTMLElement>(".editor-content.paged");
      if (!container || !editable) return;

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
    const container = paginatedContainerRef.current;
    container?.addEventListener("scroll", throttledUpdate);
    document.addEventListener("selectionchange", throttledUpdate);
    const intervalId = window.setInterval(updatePaginationStats, 150);
    return () => {
      container?.removeEventListener("scroll", throttledUpdate);
      document.removeEventListener("selectionchange", throttledUpdate);
      window.clearInterval(intervalId);
      if (throttleId) clearTimeout(throttleId);
    };
  }, [pageHeightPx]);

  const editor = {
    getRootElement: () => rootRef.current,
    getDocument: () => service.getDocument(),
    getTextContent: () => service.getDocument()?.getText() ?? "",
    getHTML: () => rootRef.current?.innerHTML ?? "",
    getContent: () => ({
      text: service.getDocument()?.getText() ?? "",
      html: rootRef.current?.innerHTML ?? "",
    }),
    setContent: (text: string) => {
      service.newDocument();
      const doc = service.getDocument();
      if (doc && text) {
        service.setSelectionFromOffsets(0, 0);
        service.insertText(text);
      }
    },
    execFormat: (cmd: string, value?: string) => {
      const sel = service.selection;
      if (!sel) return;
      
      if (cmd === "bold") {
        service.toggleBold();
      } else if (cmd === "italic") {
        service.toggleItalic();
      } else if (cmd === "font" && value !== undefined) {
        service.formatText(TextAttributes.from({ font: value || undefined }));
      } else if (cmd === "fontSize" && value !== undefined) {
        const px = value ? parseFontSizePx(value) : 16;
        if (px !== null) {
          service.formatText(TextAttributes.from({ fontSize: px }));
        }
      } else if (cmd === "textAlign" && value) {
        const blockId = sel.anchor.blockId;
        const doc = service.getDocument();
        if (doc) {
          const block = doc.getBlock(blockId);
          if (block) {
            doc.setTextAlign(blockId, value as "left" | "center" | "right" | "justify");
          }
        }
      }
    },
    execFormatWithSelection: (anchor: number, focus: number, cmd: string, value?: string) => {
      service.setSelectionFromOffsets(anchor, focus);
      if (cmd === "bold") {
        service.toggleBold();
      } else if (cmd === "italic") {
        service.toggleItalic();
      } else if (cmd === "font" && value !== undefined) {
        service.formatText(TextAttributes.from({ font: value || undefined }));
      } else if (cmd === "fontSize" && value !== undefined) {
        const px = value ? parseFontSizePx(value) : 16;
        if (px !== null) {
          service.formatText(TextAttributes.from({ fontSize: px }));
        }
      }
    },
    insertTable: (rows: number, cols: number, _includeHeaders: boolean) => {
      service.insertTableBlock(rows, cols);
    },
    insertImage: (assetRef: AssetRef) => {
      service.insertImageBlock(assetRef, assetRef.alt, assetRef.size);
    },
    focus: () => rootRef.current?.focus(),
    undo: () => service.undo(),
    redo: () => service.redo(),
    get canUndo() { return service.canUndo; },
    get canRedo() { return service.canRedo; },
    registerUpdateListener: (listener: () => void) => service.subscribe(listener),
    getActiveMarks: () => {
      const marks = service.activeMarks;
      if (!marks) return null;
      const result: { bold?: boolean | undefined; italic?: boolean | undefined; font?: string | undefined; fontSize?: number | undefined } = {};
      if (marks.bold !== undefined) result.bold = marks.bold;
      if (marks.italic !== undefined) result.italic = marks.italic;
      if (marks.font !== undefined) result.font = marks.font;
      if (marks.fontSize !== undefined) result.fontSize = marks.fontSize;
      return result;
    },
    getSelection: () => service.selection,
    getSelectionOffsets: () => {
      const sel = service.selection;
      if (!sel) return null;
      const doc = service.getDocument();
      if (!doc) return null;
      const anchorBlock = doc.getBlock(sel.anchor.blockId);
      const focusBlock = doc.getBlock(sel.focus.blockId);
      if (!anchorBlock || !focusBlock) return null;
      const anchorRange = doc.getBlockRange(sel.anchor.blockId);
      const focusRange = doc.getBlockRange(sel.focus.blockId);
      if (!anchorRange || !focusRange) return null;
      return {
        anchor: anchorRange.start + sel.anchor.offset,
        focus: focusRange.start + sel.focus.offset,
      };
    },
    setSelectionFromOffsets: (anchor: number, focus: number) => {
      service.setSelectionFromOffsets(anchor, focus);
    },
    insertText: (text: string) => service.insertText(text),
    deleteBackward: () => service.backspace(),
    deleteForward: () => service.delete(),
    splitBlock: () => service.splitBlock(),
    mergeBlocks: () => service.mergeBlocks(),
  };

  const contentEditableStylePaginated = useMemo(
    () => ({ minHeight: pageHeightPx - 96 }),
    [pageHeightPx],
  );

  useEffect(() => {
    (window as unknown as { __editor?: typeof editor }).__editor = editor;
    return () => {
      delete (window as unknown as { __editor?: typeof editor }).__editor;
    };
  }, [editor]);

  return (
    <EditorProvider service={service} rootRef={rootRef}>
      <main className="mx-auto flex h-screen max-w-7xl flex-col gap-3 p-4 text-zinc-900">
        <Toolbar
          editor={editor}
          onInsertImage={onInsertImage}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          onPageWidthChange={setPageWidthPx}
          onPageHeightChange={setPageHeightPx}
        />
        
        <div className="flex-1 overflow-hidden">
          <div
            ref={paginatedContainerRef}
            className="h-full overflow-auto bg-zinc-100"
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

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {`Page ${currentPage} of ${pageCount}`}
          </span>
          <span>
            {editor.getTextContent().length} characters
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const bytes = Array.from(new Uint8Array(atob(dataUrl.split(",")[1] ?? "").split("").map((c) => c.charCodeAt(0))));
                const asset: AssetRef = {
                  name: file.name,
                  targetPos: 0,
                  alt: file.name,
                  size: [0, 0],
                  bytes,
                };
                setAssets((prev) => [...prev, asset]);
                editor.insertImage(asset);
              };
              reader.readAsDataURL(file);
            }
            e.target.value = "";
          }}
        />
      </main>
    </EditorProvider>
  );
}

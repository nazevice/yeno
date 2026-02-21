import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { ContinuousView } from "./ContinuousView";
import { PaginatedView } from "./PaginatedView";
import { Toolbar } from "./Toolbar";
import { EditorProvider, useEditor, type EditorApi } from "./core/EditorContext";
import { ContentEditableRoot } from "./core/ContentEditableRoot";
import { TablePlugin } from "./plugins/TablePlugin";
import { ImageResizePlugin } from "./plugins/ImageResizePlugin";
import { PaginationPlugin } from "./plugins/PaginationPlugin";
import { bindToggleModeShortcut } from "~/lib/doc/hotkeys";
import { applyMetadataRanges } from "~/lib/doc/applyRanges";
import { applyContentToEditor, applyLoadedPayload, loadDocument } from "~/lib/doc/deserialize";
import { buildPayload, exportMarkdown, saveDocument } from "~/lib/doc/serialize";
import type { AssetRef, EditorMode, PerfSnapshot } from "~/lib/doc/schema";
import { VersionPanel } from "~/components/versioning";
import { addPendingAsset, AssetsProvider } from "./AssetsContext";

function normalizeAsset(name: string, data: Uint8Array): AssetRef {
  return {
    name,
    targetPos: 0,
    alt: name,
    size: [0, 0],
    bytes: Array.from(data),
  };
}

function assetToDataUrl(asset: AssetRef): string | null {
  if (!asset.bytes?.length) return null;
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

/** DIN A4 at 96 DPI: 210mm × 297mm → 794×1123 px */
const DEFAULT_PAGE_WIDTH = 794;
const DEFAULT_PAGE_HEIGHT = 1123;
const PAGE_GAP_PX = 48;
const DEFAULT_CONTINUOUS_WIDTH = 896; // max-w-4xl equivalent
const BENCHMARK_LINE_CHARS = 2048;

const clampPx = (val: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, val)));

export function EditorShell() {
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [mode, setMode] = useState<EditorMode>("continuous");
  const [pageWidthPx, setPageWidthPx] = useState(DEFAULT_PAGE_WIDTH);
  const [pageHeightPx, setPageHeightPx] = useState(DEFAULT_PAGE_HEIGHT);
  const [continuousWidthPx, setContinuousWidthPx] = useState(DEFAULT_CONTINUOUS_WIDTH);
  const pageStridePx = pageHeightPx + PAGE_GAP_PX;
  const [filePath, setFilePath] = useState("/tmp/document.grokedoc");
  const [markdownPath, setMarkdownPath] = useState("/tmp/document.md");
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [perf, setPerf] = useState<PerfSnapshot[]>([]);
  const [status, setStatus] = useState("Ready");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paginatedContainerRef = useRef<HTMLElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [showVersionPanel, setShowVersionPanel] = useState(false);

  const appendPerf = useCallback((entry: PerfSnapshot) => {
    setPerf((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const setContentImpl = useCallback(
    (root: HTMLElement, text: string, ranges?: import("~/lib/doc/schema").MetadataRange[], assetList?: AssetRef[]) => {
      applyContentToEditor(root, text, assetList ?? assets);
      if (ranges?.length) applyMetadataRanges(root, ranges);
    },
    [assets],
  );

  const applyLoadedText = useCallback(
    (text: string, assetsList?: AssetRef[]) => {
      const root = editor?.getRootElement();
      if (!root) return;
      applyContentToEditor(root, text, assetsList ?? assets);
    },
    [editor, assets],
  );

  const onToggleMode = useCallback(() => {
    setMode((prev) => (prev === "continuous" ? "paginated" : "continuous"));
  }, []);

  useEffect(() => bindToggleModeShortcut(onToggleMode), [onToggleMode]);

  useEffect(() => {
    if (mode !== "paginated") return;

    const updatePaginationStats = () => {
      const container = paginatedContainerRef.current;
      const editable = document.querySelector<HTMLElement>(".editor-content.paged");
      if (!container || !editable) return;

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
  }, [mode, pageStridePx]);

  const onSave = useCallback(async () => {
    if (!editor) return;
    const payload = buildPayload(editor);
    payload.assets = assets;
    const snapshot = await saveDocument(filePath, payload);
    appendPerf(snapshot);
    setStatus(`Saved ${filePath}`);
  }, [appendPerf, assets, editor, filePath]);

  const onExportMarkdown = useCallback(async () => {
    if (!editor) return;
    const payload = buildPayload(editor);
    const snapshot = await exportMarkdown(markdownPath, payload);
    appendPerf(snapshot);
    setStatus(`Exported Markdown to ${markdownPath}`);
  }, [appendPerf, editor, markdownPath]);

  const onLoad = useCallback(async () => {
    const result = await loadDocument(filePath);
    for (const asset of result.payload.assets) addPendingAsset(asset);
    setAssets(result.payload.assets);
    const root = editor?.getRootElement();
    if (root) {
      applyLoadedPayload(root, result.payload);
      setStatus(`Loaded ${filePath}`);
    } else {
      setStatus("Editor not ready. Try opening again.");
    }
    appendPerf(result.perf);
  }, [appendPerf, editor, filePath]);

  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onInsertTestImage = useCallback(() => {
    if (!editor) return;
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = "#fff";
    ctx.font = "14px system-ui";
    ctx.fillText("OK", 28, 48);
    const dataUrl = canvas.toDataURL("image/png");
    const binary = atob(dataUrl.split(",")[1]!);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const name = `test-${Date.now()}.png`;
    const asset = normalizeAsset(name, bytes);
    addPendingAsset(asset);
    setAssets((prev) => [...prev, asset]);
    editor.insertImage(name, "Test image", dataUrl);
    setStatus("Inserted test image");
  }, [editor]);

  const PAGINATION_TEST_TEXT = `Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.`;

  const onLoadPaginationTest = useCallback(() => {
    if (!editor) return;
    const repeated = Array(5).fill(PAGINATION_TEST_TEXT).join("\n\n");
    applyLoadedText(repeated);
    setStatus("Loaded pagination test (5x)");
    if (mode === "paginated") {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("pagination-delayed-reflow"));
      }, 1000);
    }
  }, [applyLoadedText, editor, mode]);

  const runLargeDocumentBenchmark = useCallback(() => {
    if (!editor) return;
    const targetBytes = 10 * 1024 * 1024;
    const seed = "0123456789abcdefghijklmnopqrstuvwxyz ";
    const chunkCount = Math.ceil(targetBytes / seed.length);
    const raw = seed.repeat(chunkCount).slice(0, targetBytes);
    const lines: string[] = [];
    for (let offset = 0; offset < raw.length; offset += BENCHMARK_LINE_CHARS) {
      lines.push(raw.slice(offset, offset + BENCHMARK_LINE_CHARS));
    }
    const content = lines.join("\n");
    const start = performance.now();
    applyLoadedText(content);
    const elapsedMs = performance.now() - start;
    appendPerf({
      operation: "load_10mb_document_in_editor",
      elapsedMs: Math.round(elapsedMs),
      payloadBytes: content.length,
    });
    setStatus(`Loaded synthetic 10MB text in ${Math.round(elapsedMs)}ms`);
  }, [appendPerf, applyLoadedText, editor]);

  const onPickImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const asset = normalizeAsset(file.name, bytes);
      addPendingAsset(asset);
      setAssets((prev) => [...prev, asset]);
      const dataUrl = assetToDataUrl(asset);
      editor.insertImage(file.name, file.name, dataUrl ?? undefined);
      event.target.value = "";
    },
    [editor],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) return;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const name = `pasted-${Date.now()}-${file.name || "image.png"}`;
            const binary = atob(dataUrl.split(",")[1]!);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const asset = normalizeAsset(name, bytes);
            addPendingAsset(asset);
            setAssets((prev) => [...prev, asset]);
            editor?.insertImage(name, name, dataUrl);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    },
    [editor],
  );

  const getCurrentContent = useCallback(() => editor?.getTextContent() ?? "", [editor]);

  const onVersionRestore = useCallback(
    (content: string) => {
      applyLoadedText(content, assets);
      setStatus("Restored version");
    },
    [applyLoadedText, assets],
  );

  const onPageWidthChange = useCallback((px: number) => {
    setPageWidthPx(clampPx(px, 200, 2000));
  }, []);

  const onPageHeightChange = useCallback((px: number) => {
    setPageHeightPx(clampPx(px, 300, 2000));
  }, []);

  const onContinuousWidthChange = useCallback((px: number) => {
    setContinuousWidthPx(clampPx(px, 200, 2000));
  }, []);

  const editorContent =
    mode === "continuous" ? (
      <ContinuousView contentWidthPx={continuousWidthPx}>
        <ContentEditableRoot
          className="editor-content min-h-[70vh] rounded-lg p-4 outline-none mb-2"
          data-testid="editor-content"
          onPaste={handlePaste}
        />
      </ContinuousView>
    ) : (
      <PaginatedView
        containerRef={paginatedContainerRef}
        currentPage={currentPage}
        pageCount={pageCount}
        pageWidthPx={pageWidthPx}
        pageHeightPx={pageHeightPx}
        pageGapPx={PAGE_GAP_PX}
      >
        <ContentEditableRoot
          className="editor-content paged rounded-lg p-8 outline-none"
          data-testid="editor-content"
          style={
            {
              "--page-width": `${pageWidthPx}px`,
              "--page-height": `${pageHeightPx}px`,
              "--page-gap": `${PAGE_GAP_PX}px`,
              minHeight: `${Math.max(pageCount, 1) * pageStridePx - PAGE_GAP_PX}px`,
            } as CSSProperties
          }
          onPaste={handlePaste}
        />
      </PaginatedView>
    );

  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col gap-3 p-4 text-zinc-900">
      <EditorProvider
        setContentImpl={setContentImpl}
        onReady={setEditor}
      >
        <Toolbar
          editor={editor}
          mode={mode}
          onToggleMode={onToggleMode}
          onInsertImage={onInsertImage}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          onPageWidthChange={onPageWidthChange}
          onPageHeightChange={onPageHeightChange}
          continuousWidthPx={continuousWidthPx}
          onContinuousWidthChange={onContinuousWidthChange}
        />

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <label className="text-sm font-medium">Doc path</label>
          <input
            className="min-w-[22rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
          />
          <button className="toolbar-btn" onClick={onLoad}>Open</button>
          <button className="toolbar-btn" onClick={onSave}>Save</button>
          <button
            className="toolbar-btn bg-purple-100 text-purple-700 hover:bg-purple-200"
            onClick={() => setShowVersionPanel(true)}
          >
            Versions
          </button>
          <input
            className="min-w-[22rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            value={markdownPath}
            onChange={(e) => setMarkdownPath(e.target.value)}
          />
          <button className="toolbar-btn" onClick={onExportMarkdown}>Export .md</button>
          <button className="toolbar-btn" onClick={runLargeDocumentBenchmark}>10MB Benchmark</button>
          <button
            className="toolbar-btn bg-amber-100 text-amber-800 hover:bg-amber-200"
            data-testid="test-image-btn"
            onClick={onInsertTestImage}
            title="Insert test image (no file dialog)"
          >
            Test Image
          </button>
          <button
            className="toolbar-btn bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
            onClick={onLoadPaginationTest}
            title="Load Lorem ipsum test text 5x for pagination testing"
          >
            Pagination Test
          </button>
          <button
            className="toolbar-btn bg-cyan-100 text-cyan-800 hover:bg-cyan-200"
            data-testid="test-table-resize-btn"
            onClick={() => {
              const table = document.querySelector(".editor-content table");
              if (table) {
                window.dispatchEvent(new CustomEvent("table-resizer-scan"));
                setStatus("Table resize test: Triggered scan. (Resize handles to be implemented.)");
              } else if (editor) {
                setStatus("Table resize test: Inserting table...");
                editor.focus();
                editor.insertTable(3, 4, true);
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("table-resizer-scan"));
                  setStatus("Table inserted. Resize handles to be implemented.");
                }, 500);
              } else {
                setStatus("Table resize test: Editor not ready.");
              }
            }}
            title="Insert table (if none) and test column resize."
          >
            Test Table Resize
          </button>
        </div>

        <AssetsProvider assets={assets}>
          <TablePlugin />
          <ImageResizePlugin key={mode} />
          <PaginationPlugin
            pageHeightPx={pageHeightPx}
            pageGapPx={PAGE_GAP_PX}
            enabled={mode === "paginated"}
          />
          {editorContent}
        </AssetsProvider>
      </EditorProvider>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm">
        <p className="font-medium">{status}</p>
        <p className="text-zinc-500">Embedded assets: {assets.length}</p>
        <div className="mt-2 space-y-1 text-xs text-zinc-600">
          {perf.map((item, index) => (
            <p key={`${item.operation}-${index}`}>
              {item.operation}: {item.elapsedMs}ms ({item.payloadBytes} bytes)
            </p>
          ))}
        </div>
      </section>

      <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={onPickImage} />

      {showVersionPanel && (
        <VersionPanel
          documentPath={filePath}
          currentContent={getCurrentContent()}
          onRestore={onVersionRestore}
          onClose={() => setShowVersionPanel(false)}
        />
      )}
    </main>
  );
}

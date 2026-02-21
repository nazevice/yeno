import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { ContinuousView } from "./ContinuousView";
import { PaginatedView } from "./PaginatedView";
import { Toolbar } from "./Toolbar";
import { EditorProvider, useEditor } from "./core/EditorContext";
import { ContentEditableRoot } from "./core/ContentEditableRoot";
import { TablePlugin } from "./plugins/TablePlugin";
import { ImageResizePlugin } from "./plugins/ImageResizePlugin";
import { PaginationPlugin } from "./plugins/PaginationPlugin";
import { bindToggleModeShortcut } from "~/lib/doc/hotkeys";
import { loadDocument, createEngineFromPayload } from "~/lib/doc/deserialize";
import { buildPayload, exportMarkdown, saveDocument } from "~/lib/doc/serialize";
import type { AssetRef, EditorMode, PerfSnapshot } from "~/lib/doc/schema";
import { VersionPanel } from "~/components/versioning";
import { addPendingAsset, AssetsProvider } from "./AssetsContext";
import { EditorEngine } from "~/lib/doc/editorEngine";

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
const DEFAULT_CONTINUOUS_WIDTH = 896;
const BENCHMARK_LINE_CHARS = 2048;

const clampPx = (val: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, val)));

function EditorShellContent({
  engine,
  setEngine,
  assets,
  setAssets,
  mode,
  setMode,
  onToggleMode,
  pageWidthPx,
  pageHeightPx,
  pageStridePx,
  continuousWidthPx,
  setPageWidthPx,
  setPageHeightPx,
  setContinuousWidthPx,
  filePath,
  setFilePath,
  markdownPath,
  setMarkdownPath,
  appendPerf,
  setStatus,
  perf,
  status,
  setShowVersionPanel,
  showVersionPanel,
  getCurrentContent,
  onVersionRestore,
  paginatedContainerRef,
  currentPage,
  pageCount,
  setCurrentPage,
  setPageCount,
  fileInputRef,
}: {
  engine: EditorEngine;
  setEngine: React.Dispatch<React.SetStateAction<EditorEngine>>;
  assets: AssetRef[];
  setAssets: React.Dispatch<React.SetStateAction<AssetRef[]>>;
  mode: EditorMode;
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  onToggleMode: () => void;
  pageWidthPx: number;
  pageHeightPx: number;
  pageStridePx: number;
  continuousWidthPx: number;
  setPageWidthPx: (v: number) => void;
  setPageHeightPx: (v: number) => void;
  setContinuousWidthPx: (v: number) => void;
  filePath: string;
  setFilePath: (v: string) => void;
  markdownPath: string;
  setMarkdownPath: (v: string) => void;
  appendPerf: (p: PerfSnapshot) => void;
  setStatus: (s: string) => void;
  perf: PerfSnapshot[];
  status: string;
  setShowVersionPanel: (v: boolean) => void;
  showVersionPanel: boolean;
  getCurrentContent: () => string;
  onVersionRestore: (content: string) => void;
  paginatedContainerRef: React.RefObject<HTMLElement | null>;
  currentPage: number;
  pageCount: number;
  setCurrentPage: (n: number) => void;
  setPageCount: (n: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const editor = useEditor();
  const PAGINATION_TEST_TEXT = `Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.`;
  const BENCHMARK_LINE_CHARS = 2048;
  const clampPx = (val: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, val)));

  const onSave = useCallback(async () => {
    const payload = buildPayload(engine);
    payload.assets = assets;
    const snapshot = await saveDocument(filePath, payload);
    appendPerf(snapshot);
    setStatus(`Saved ${filePath}`);
  }, [appendPerf, assets, engine, filePath]);

  const onLoad = useCallback(async () => {
    try {
      const result = await loadDocument(filePath);
      if (!result.payload.documentTree) {
        setStatus("Invalid document format (missing documentTree)");
        return;
      }
      for (const asset of result.payload.assets) addPendingAsset(asset);
      setAssets(result.payload.assets);
      const newEngine = createEngineFromPayload(result.payload);
      setEngine(newEngine);
      setStatus(`Loaded ${filePath}`);
      appendPerf(result.perf);
    } catch (err) {
      setStatus(`Load failed: ${err}`);
    }
  }, [appendPerf, filePath, setAssets, setEngine, setStatus]);

  const onExportMarkdown = useCallback(async () => {
    const payload = buildPayload(engine);
    const snapshot = await exportMarkdown(markdownPath, payload);
    appendPerf(snapshot);
    setStatus(`Exported Markdown to ${markdownPath}`);
  }, [appendPerf, engine, markdownPath]);

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
    const asset = { name, targetPos: 0, alt: name, size: [0, 0] as [number, number], bytes: Array.from(bytes) };
    addPendingAsset(asset);
    setAssets((prev) => [...prev, asset]);
    editor.insertImage(name, "Test image", dataUrl);
    setStatus("Inserted test image");
  }, [editor, setAssets, setStatus]);

  const onLoadPaginationTest = useCallback(() => {
    if (!editor) return;
    editor.setContent(Array(5).fill(PAGINATION_TEST_TEXT).join("\n\n"));
    setStatus("Loaded pagination test (5x)");
    if (mode === "paginated") {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("pagination-delayed-reflow")), 1000);
    }
  }, [editor, mode, setStatus]);

  const runLargeDocumentBenchmark = useCallback(() => {
    if (!editor) return;
    const targetBytes = 10 * 1024 * 1024;
    const seed = "0123456789abcdefghijklmnopqrstuvwxyz ";
    const raw = seed.repeat(Math.ceil(targetBytes / seed.length)).slice(0, targetBytes);
    const lines: string[] = [];
    for (let offset = 0; offset < raw.length; offset += BENCHMARK_LINE_CHARS) {
      lines.push(raw.slice(offset, offset + BENCHMARK_LINE_CHARS));
    }
    const content = lines.join("\n");
    const start = performance.now();
    editor.setContent(content);
    const elapsedMs = performance.now() - start;
    appendPerf({
      operation: "load_10mb_document_in_editor",
      elapsedMs: Math.round(elapsedMs),
      payloadBytes: content.length,
    });
    setStatus(`Loaded synthetic 10MB text in ${Math.round(elapsedMs)}ms`);
  }, [appendPerf, editor, setStatus]);

  const onPickImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const asset = { name: file.name, targetPos: 0, alt: file.name, size: [0, 0] as [number, number], bytes: Array.from(bytes) };
      addPendingAsset(asset);
      setAssets((prev) => [...prev, asset]);
      const dataUrl = asset.bytes?.length
        ? `data:image/png;base64,${btoa(String.fromCharCode(...asset.bytes))}`
        : null;
      editor.insertImage(file.name, file.name, dataUrl ?? undefined);
      event.target.value = "";
    },
    [editor, setAssets],
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
            const asset = { name, targetPos: 0, alt: name, size: [0, 0] as [number, number], bytes: Array.from(bytes) };
            addPendingAsset(asset);
            setAssets((prev) => [...prev, asset]);
            editor?.insertImage(name, name, dataUrl);
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [editor, setAssets],
  );

  const onPageWidthChange = useCallback((px: number) => setPageWidthPx(clampPx(px, 200, 2000)), [setPageWidthPx]);
  const onPageHeightChange = useCallback((px: number) => setPageHeightPx(clampPx(px, 300, 2000)), [setPageHeightPx]);
  const onContinuousWidthChange = useCallback((px: number) => setContinuousWidthPx(clampPx(px, 200, 2000)), [setContinuousWidthPx]);

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
    <>
      <Toolbar
        editor={editor}
        mode={mode}
        onToggleMode={onToggleMode}
        onInsertImage={() => fileInputRef.current?.click()}
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
        <button className="toolbar-btn bg-purple-100 text-purple-700 hover:bg-purple-200" onClick={() => setShowVersionPanel(true)}>
          Versions
        </button>
        <input
          className="min-w-[22rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          value={markdownPath}
          onChange={(e) => setMarkdownPath(e.target.value)}
        />
        <button className="toolbar-btn" onClick={onExportMarkdown}>Export .md</button>
        <button className="toolbar-btn" onClick={runLargeDocumentBenchmark}>10MB Benchmark</button>
        <button className="toolbar-btn bg-amber-100 text-amber-800 hover:bg-amber-200" data-testid="test-image-btn" onClick={onInsertTestImage}>
          Test Image
        </button>
        <button className="toolbar-btn bg-emerald-100 text-emerald-800 hover:bg-emerald-200" onClick={onLoadPaginationTest}>
          Pagination Test
        </button>
        <button
          className="toolbar-btn bg-cyan-100 text-cyan-800 hover:bg-cyan-200"
          data-testid="test-table-resize-btn"
          onClick={() => {
            const table = document.querySelector(".editor-content table");
            if (table) {
              window.dispatchEvent(new CustomEvent("table-resizer-scan"));
              setStatus("Table resize test: Triggered scan.");
            } else if (editor) {
              setStatus("Table resize test: Inserting table...");
              editor.focus();
              editor.insertTable(3, 4, true);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("table-resizer-scan"));
                setStatus("Table inserted.");
              }, 500);
            } else {
              setStatus("Table resize test: Editor not ready.");
            }
          }}
        >
          Test Table Resize
        </button>
      </div>
      <AssetsProvider assets={assets}>
        <TablePlugin />
        <ImageResizePlugin key={mode} />
        <PaginationPlugin pageHeightPx={pageHeightPx} pageGapPx={PAGE_GAP_PX} enabled={mode === "paginated"} />
        {editorContent}
      </AssetsProvider>
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
    </>
  );
}

export function EditorShell() {
  const [engine, setEngine] = useState(() => new EditorEngine());
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
    const payload = buildPayload(engine);
    payload.assets = assets;
    const snapshot = await saveDocument(filePath, payload);
    appendPerf(snapshot);
    setStatus(`Saved ${filePath}`);
  }, [appendPerf, assets, engine, filePath]);

  const onExportMarkdown = useCallback(async () => {
    const payload = buildPayload(engine);
    const snapshot = await exportMarkdown(markdownPath, payload);
    appendPerf(snapshot);
    setStatus(`Exported Markdown to ${markdownPath}`);
  }, [appendPerf, engine, markdownPath]);

  const getCurrentContent = useCallback(() => engine.textBuffer.getText(), [engine]);

  const onVersionRestore = useCallback(
    (content: string) => {
      engine.loadPlainText(content);
      setStatus("Restored version");
    },
    [engine],
  );

  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col gap-3 p-4 text-zinc-900">
      <EditorProvider
        engine={engine}
        getAssetDataUrl={(name) =>
          assetToDataUrl(assets.find((a) => a.name === name) ?? { name: "", targetPos: 0, alt: "", size: [0, 0], bytes: [] }) ?? null
        }
      >
        <EditorShellContent
          engine={engine}
          setEngine={setEngine}
          assets={assets}
          setAssets={setAssets}
          mode={mode}
          setMode={setMode}
          onToggleMode={onToggleMode}
          pageWidthPx={pageWidthPx}
          pageHeightPx={pageHeightPx}
          pageStridePx={pageStridePx}
          continuousWidthPx={continuousWidthPx}
          setPageWidthPx={setPageWidthPx}
          setPageHeightPx={setPageHeightPx}
          setContinuousWidthPx={setContinuousWidthPx}
          filePath={filePath}
          setFilePath={setFilePath}
          markdownPath={markdownPath}
          setMarkdownPath={setMarkdownPath}
          appendPerf={appendPerf}
          setStatus={setStatus}
          perf={perf}
          status={status}
          setShowVersionPanel={setShowVersionPanel}
          showVersionPanel={showVersionPanel}
          getCurrentContent={getCurrentContent}
          onVersionRestore={onVersionRestore}
          paginatedContainerRef={paginatedContainerRef}
          currentPage={currentPage}
          pageCount={pageCount}
          setCurrentPage={setCurrentPage}
          setPageCount={setPageCount}
          fileInputRef={fileInputRef}
        />
      </EditorProvider>
    </main>
  );
}

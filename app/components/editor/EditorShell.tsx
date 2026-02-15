import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { $getRoot, type LexicalEditor } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { LinkNode } from "@lexical/link";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { ContinuousView } from "./ContinuousView";
import { PaginatedView } from "./PaginatedView";
import { Toolbar } from "./Toolbar";
import { ImagePlugin, INSERT_IMAGE_TOKEN_COMMAND, INSERT_IMAGE_ASSET_COMMAND } from "./plugins/ImagePlugin";
import { bindToggleModeShortcut } from "~/lib/doc/hotkeys";
import { applyContentToEditor, applyLoadedPayload, loadDocument } from "~/lib/doc/deserialize";
import { buildPayload, exportMarkdown, saveDocument } from "~/lib/doc/serialize";
import type { AssetRef, EditorMode, PerfSnapshot } from "~/lib/doc/schema";
import { VersionPanel } from "~/components/versioning";
import { addPendingAsset, AssetsProvider } from "./AssetsContext";
import { ImageNode } from "./nodes/ImageNode";

function EditorRefBridge({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onReady(editor), [editor, onReady]);
  return null;
}

function normalizeAsset(name: string, data: Uint8Array): AssetRef {
  return {
    name,
    targetPos: 0,
    alt: name,
    size: [0, 0],
    bytes: Array.from(data),
  };
}

const editorTheme = {
  paragraph: "mb-2",
  text: {
    bold: "font-semibold",
    italic: "italic",
  },
  heading: {
    h1: "text-3xl font-bold leading-tight mt-4 mb-3",
    h2: "text-2xl font-semibold leading-tight mt-4 mb-2",
    h3: "text-xl font-semibold leading-tight mt-3 mb-2",
  },
};

/** DIN A4 at 96 DPI: 210mm × 297mm → 794×1123 px */
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const PAGE_GAP_PX = 48;
const PAGE_STRIDE_PX = PAGE_HEIGHT_PX + PAGE_GAP_PX;
const BENCHMARK_LINE_CHARS = 2048;

export function EditorShell() {
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [mode, setMode] = useState<EditorMode>("continuous");
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

  const initialConfig = useMemo(
    () => ({
      namespace: "yeno-editor",
      theme: editorTheme,
      onError(error: Error) {
        throw error;
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, ImageNode],
    }),
    [],
  );

  const appendPerf = useCallback((entry: PerfSnapshot) => {
    setPerf((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const applyLoadedText = useCallback(
    (text: string, assets?: AssetRef[]) => {
      if (!editor) return;
      applyContentToEditor(editor, text, assets ?? []);
    },
    [editor],
  );

  const onToggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "continuous" ? "paginated" : "continuous";
      return next;
    });
  }, []);

  useEffect(() => bindToggleModeShortcut(onToggleMode), [onToggleMode]);

  useEffect(() => {
    if (mode !== "paginated") {
      return;
    }

    const updatePaginationStats = () => {
      const container = paginatedContainerRef.current;
      const editable = document.querySelector<HTMLElement>(".editor-content.paged");
      if (!container || !editable) {
        return;
      }

      const computedPageCount = Math.max(1, Math.ceil(editable.scrollHeight / PAGE_STRIDE_PX));
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

      const nextPage = Math.max(1, Math.min(computedPageCount, Math.floor(cursorY / PAGE_STRIDE_PX) + 1));
      setCurrentPage((prevPage) => {
        return prevPage === nextPage ? prevPage : nextPage;
      });
    };

    updatePaginationStats();
    const container = paginatedContainerRef.current;
    const onScroll = () => updatePaginationStats();
    const onSelectionChange = () => updatePaginationStats();
    const intervalId = window.setInterval(() => updatePaginationStats(), 250);
    container?.addEventListener("scroll", onScroll);
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      container?.removeEventListener("scroll", onScroll);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.clearInterval(intervalId);
    };
  }, [mode]);

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
    for (const asset of result.payload.assets) {
      addPendingAsset(asset);
    }
    setAssets(result.payload.assets);
    if (editor) {
      applyLoadedPayload(editor, result.payload);
      setStatus(`Loaded ${filePath}`);
    } else {
      setStatus("Editor not ready. Try opening again.");
    }
    appendPerf(result.perf);
  }, [appendPerf, editor, filePath]);

  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Dev: Insert test image without file picker (80x80 red square PNG for visibility)
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
    editor.dispatchCommand(INSERT_IMAGE_TOKEN_COMMAND, { name, alt: "Test image" });
    setStatus("Inserted test image");
  }, [editor]);

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
  }, [appendPerf, applyLoadedText, editor, mode]);

  const onPickImage = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const asset = normalizeAsset(file.name, bytes);
      addPendingAsset(asset);
      setAssets((prev) => [...prev, asset]);
      editor.dispatchCommand(INSERT_IMAGE_TOKEN_COMMAND, {
        name: file.name,
        alt: file.name,
      });
      event.target.value = "";
    },
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    return editor.registerCommand(
      INSERT_IMAGE_ASSET_COMMAND,
      (payload) => {
        const asset = normalizeAsset(payload.name, payload.data);
        addPendingAsset(asset);
        setAssets((prev) => [...prev, asset]);
        editor.dispatchCommand(INSERT_IMAGE_TOKEN_COMMAND, {
          name: payload.name,
          alt: payload.alt,
        });
        return true;
      },
      0,
    );
  }, [editor]);

  // Get current document text content
  const getCurrentContent = useCallback((): string => {
    if (!editor) return "";
    let text = "";
    editor.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    return text;
  }, [editor]);

  // Handle version restore
  const onVersionRestore = useCallback(
    (content: string) => {
      applyLoadedText(content, assets);
      setStatus("Restored version");
    },
    [applyLoadedText, assets],
  );

  return (
    <main className="mx-auto flex h-screen max-w-7xl flex-col gap-3 p-4 text-zinc-900">
      <Toolbar editor={editor} mode={mode} onToggleMode={onToggleMode} onInsertImage={onInsertImage} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <label className="text-sm font-medium">Doc path</label>
        <input
          className="min-w-[22rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
        />
        <button className="toolbar-btn" onClick={onLoad}>
          Open
        </button>
        <button className="toolbar-btn" onClick={onSave}>
          Save
        </button>
        <button
          className="toolbar-btn bg-purple-100 text-purple-700 hover:bg-purple-200"
          onClick={() => setShowVersionPanel(true)}
        >
          Versions
        </button>
        <input
          className="min-w-[22rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm"
          value={markdownPath}
          onChange={(event) => setMarkdownPath(event.target.value)}
        />
        <button className="toolbar-btn" onClick={onExportMarkdown}>
          Export .md
        </button>
        <button className="toolbar-btn" onClick={runLargeDocumentBenchmark}>
          10MB Benchmark
        </button>
        <button
          className="toolbar-btn bg-amber-100 text-amber-800 hover:bg-amber-200"
          onClick={onInsertTestImage}
          title="Insert test image (no file dialog)"
        >
          Test Image
        </button>
      </div>

      <LexicalComposer initialConfig={initialConfig}>
        <AssetsProvider assets={assets}>
          <EditorRefBridge onReady={setEditor} />
          <HistoryPlugin />
          <OnChangePlugin ignoreSelectionChange onChange={() => {}} />
          <ImagePlugin />
          {mode === "continuous" ? (
          <ContinuousView>
            <RichTextPlugin
              contentEditable={<ContentEditable className="editor-content min-h-[70vh] rounded-lg p-4 outline-none" />}
              placeholder={<p className="text-zinc-400">Start writing...</p>}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </ContinuousView>
        ) : (
          <PaginatedView
            containerRef={paginatedContainerRef}
            currentPage={currentPage}
            pageCount={pageCount}
            pageStridePx={PAGE_STRIDE_PX}
            pageWidthPx={PAGE_WIDTH_PX}
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="editor-content paged min-h-[70vh] rounded-lg p-8 outline-none"
                  style={
                    {
                      "--page-width": `${PAGE_WIDTH_PX}px`,
                      "--page-height": `${PAGE_HEIGHT_PX}px`,
                      "--page-gap": `${PAGE_GAP_PX}px`,
                    } as CSSProperties
                  }
                />
              }
              placeholder={<p className="text-zinc-400">Start writing...</p>}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </PaginatedView>
        )}
        </AssetsProvider>
      </LexicalComposer>

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

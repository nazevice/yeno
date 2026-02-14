import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from "lexical";
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
import { ImagePlugin, INSERT_IMAGE_TOKEN_COMMAND } from "./plugins/ImagePlugin";
import { bindToggleModeShortcut } from "~/lib/doc/hotkeys";
import { loadDocument } from "~/lib/doc/deserialize";
import { buildPayload, exportMarkdown, saveDocument } from "~/lib/doc/serialize";
import type { AssetRef, EditorMode, PerfSnapshot } from "~/lib/doc/schema";

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

const PAGE_HEIGHT_PX = 1120;
const PAGE_GAP_PX = 48;
const PAGE_STRIDE_PX = PAGE_HEIGHT_PX + PAGE_GAP_PX;

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

  const initialConfig = useMemo(
    () => ({
      namespace: "yeno-editor",
      theme: editorTheme,
      onError(error: Error) {
        throw error;
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
    }),
    [],
  );

  const appendPerf = useCallback((entry: PerfSnapshot) => {
    setPerf((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const applyLoadedText = useCallback((text: string) => {
    if (!editor) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      for (const line of text.split("\n")) {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(line));
        root.append(paragraph);
      }
    });
  }, [editor]);

  const onToggleMode = useCallback(() => {
    setMode((prev) => (prev === "continuous" ? "paginated" : "continuous"));
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
      setCurrentPage(nextPage);
    };

    updatePaginationStats();
    const container = paginatedContainerRef.current;
    container?.addEventListener("scroll", updatePaginationStats);
    document.addEventListener("selectionchange", updatePaginationStats);
    const intervalId = window.setInterval(updatePaginationStats, 250);

    return () => {
      container?.removeEventListener("scroll", updatePaginationStats);
      document.removeEventListener("selectionchange", updatePaginationStats);
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
    applyLoadedText(result.text);
    setAssets(result.payload.assets);
    appendPerf(result.perf);
    setStatus(`Loaded ${filePath}`);
  }, [appendPerf, applyLoadedText, filePath]);

  const onInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const runLargeDocumentBenchmark = useCallback(() => {
    if (!editor) return;
    const targetBytes = 10 * 1024 * 1024;
    const seed = "0123456789abcdefghijklmnopqrstuvwxyz ";
    const chunkCount = Math.ceil(targetBytes / seed.length);
    const content = seed.repeat(chunkCount).slice(0, targetBytes);
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
      setAssets((prev) => [...prev, normalizeAsset(file.name, bytes)]);
      editor.dispatchCommand(INSERT_IMAGE_TOKEN_COMMAND, {
        name: file.name,
        alt: file.name,
      });
      event.target.value = "";
    },
    [editor],
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
      </div>

      <LexicalComposer initialConfig={initialConfig}>
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
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="editor-content paged min-h-[70vh] rounded-lg p-8 outline-none"
                  style={
                    {
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
    </main>
  );
}

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { createHistoryStack, type HistoryEntry } from "./history";
import {
  getTextContentFromDOM,
  getSelectionOffsets,
  createRangeFromOffsets,
} from "./domSelection";
import { createParagraphElement } from "./blockUtils";
import type { AssetRef } from "~/lib/doc/schema";
import type { MetadataRange } from "~/lib/doc/schema";

export interface EditorApi {
  getRootElement: () => HTMLElement | null;
  getTextContent: () => string;
  getHTML: () => string;
  getContent: () => { text: string; html: string };
  setContent: (text: string, ranges?: MetadataRange[], assets?: AssetRef[]) => void;
  execFormat: (
    cmd: "bold" | "italic" | "font" | "fontSize" | "blockType" | "textAlign",
    value?: string,
  ) => void;
  insertTable: (rows: number, cols: number, includeHeaders: boolean) => void;
  insertImage: (name: string, alt: string, dataUrl?: string) => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  registerUpdateListener: (listener: () => void) => () => void;
  pushHistory: () => void;
}

type EditorContextValue = {
  editor: EditorApi | null;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

const EditorContext = createContext<EditorContextValue>({
  editor: null,
  rootRef: { current: null },
});

export function useEditor(): EditorApi | null {
  const { editor } = useContext(EditorContext);
  return editor;
}

export function useEditorContext(): EditorContextValue {
  return useContext(EditorContext);
}

export function EditorProvider({
  children,
  onReady,
  setContentImpl,
}: {
  children: ReactNode;
  onReady?: (editor: EditorApi) => void;
  setContentImpl: (root: HTMLElement, text: string, ranges?: MetadataRange[], assets?: AssetRef[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<ReturnType<typeof createHistoryStack> | null>(null);
  const updateListenersRef = useRef<Set<() => void>>(new Set());


  const editor = useMemo((): EditorApi => {
    const getRoot = () => rootRef.current;
    const getCurrentState = (): HistoryEntry => {
      const root = getRoot();
      if (!root) return { html: "", selection: null };
      const sel = getSelectionOffsets(root);
      return {
        html: root.innerHTML,
        selection: sel ? { anchorOffset: sel.anchor, focusOffset: sel.focus } : null,
      };
    };
    const applyState = (entry: HistoryEntry) => {
      const root = getRoot();
      if (!root) return;
      root.innerHTML = entry.html;
      if (entry.selection) {
        const range = createRangeFromOffsets(
          root,
          entry.selection.anchorOffset,
          entry.selection.focusOffset,
        );
        if (range) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    };

    historyRef.current = createHistoryStack(getCurrentState, applyState);
    const history = historyRef.current;

    return {
      getRootElement: getRoot,
      getTextContent: () => (getRoot() ? getTextContentFromDOM(getRoot()!) : ""),
      getHTML: () => getRoot()?.innerHTML ?? "",
      getContent: () => ({
        text: getRoot() ? getTextContentFromDOM(getRoot()!) : "",
        html: getRoot()?.innerHTML ?? "",
      }),
      setContent: (text, ranges, assets) => {
        const root = getRoot();
        if (root) setContentImpl(root, text, ranges, assets);
      },
      execFormat: (cmd, value) => {
        const root = getRoot();
        if (!root) return;
        if (cmd === "bold") {
          document.execCommand("bold", false);
        } else if (cmd === "italic") {
          document.execCommand("italic", false);
        } else if (cmd === "font" && value) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const span = document.createElement("span");
            span.style.fontFamily = value;
            try {
              range.surroundContents(span);
            } catch {
              span.appendChild(range.extractContents());
              range.insertNode(span);
            }
          }
        } else if (cmd === "fontSize" && value !== undefined) {
          if (value === "default" || value === "") {
            document.execCommand("removeFormat", false);
          } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              const span = document.createElement("span");
              span.style.fontSize = value;
              try {
                range.surroundContents(span);
              } catch {
                span.appendChild(range.extractContents());
                range.insertNode(span);
              }
            }
          }
        } else if (cmd === "blockType" && value) {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          let block = range.commonAncestorContainer;
          if (block.nodeType === Node.TEXT_NODE) block = block.parentNode!;
          while (block && block !== root) {
            const tag = (block as HTMLElement).tagName;
            if (["P", "H1", "H2", "H3", "DIV"].includes(tag)) {
              const newTag = value.toUpperCase() as "P" | "H1" | "H2" | "H3";
              if (tag !== newTag) {
                const wrapper = document.createElement(newTag);
                wrapper.innerHTML = (block as HTMLElement).innerHTML;
                (block as HTMLElement).parentNode?.replaceChild(wrapper, block as HTMLElement);
              }
              break;
            }
            block = block.parentNode!;
          }
        } else if (cmd === "textAlign" && value) {
          const execMap = {
            left: "justifyLeft",
            center: "justifyCenter",
            right: "justifyRight",
            justify: "justifyFull",
          } as const;
          const execCmd = execMap[value as keyof typeof execMap];
          if (execCmd) document.execCommand(execCmd, false);
        }
        updateListenersRef.current.forEach((fn) => fn());
      },
      insertTable: (rows, cols, includeHeaders) => {
        const root = getRoot();
        if (!root) return;
        const table = document.createElement("table");
        table.className = "editor-table w-full border-collapse my-2";
        for (let r = 0; r < rows; r++) {
          const tr = document.createElement("tr");
          tr.className = "editor-table-row";
          const cellTag = includeHeaders && r === 0 ? "th" : "td";
          const cellClass =
            includeHeaders && r === 0
              ? "editor-table-cell-header bg-zinc-100 font-semibold border border-zinc-300 p-1 align-top"
              : "editor-table-cell border border-zinc-300 p-1 align-top";
          for (let c = 0; c < cols; c++) {
            const cell = document.createElement(cellTag);
            cell.className = cellClass;
            cell.innerHTML = "<br>";
            tr.appendChild(cell);
          }
          table.appendChild(tr);
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(table);
          range.collapse(false);
        } else {
          root.appendChild(table);
        }
        const p = createParagraphElement();
        p.innerHTML = "<br>";
        root.appendChild(p);
        window.dispatchEvent(new CustomEvent("table-resizer-scan"));
        updateListenersRef.current.forEach((fn) => fn());
      },
      insertImage: (name, alt, dataUrl) => {
        const root = getRoot();
        if (!root) return;
        const div = document.createElement("div");
        div.setAttribute("data-type", "image");
        div.setAttribute("contenteditable", "false");
        div.setAttribute("data-asset", name);
        div.setAttribute("data-alt", alt || name);
        div.className = "my-2 inline-block relative";
        const img = document.createElement("img");
        img.setAttribute("data-asset", name);
        img.alt = alt || name;
        img.loading = "lazy";
        img.onload = () => {
          window.dispatchEvent(new CustomEvent("pagination-delayed-reflow"));
          window.dispatchEvent(new CustomEvent("image-resizer-scan"));
        };
        if (dataUrl) img.src = dataUrl;
        div.appendChild(img);
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(div);
          range.collapse(false);
        } else {
          root.appendChild(div);
        }
        const p = createParagraphElement();
        p.innerHTML = "<br>";
        root.appendChild(p);
        window.dispatchEvent(new CustomEvent("image-resizer-scan"));
        updateListenersRef.current.forEach((fn) => fn());
      },
      focus: () => getRoot()?.focus(),
      undo: () => history.undo(),
      redo: () => history.redo(),
      get canUndo() {
        return history.canUndo;
      },
      get canRedo() {
        return history.canRedo;
      },
      registerUpdateListener: (listener) => {
        updateListenersRef.current.add(listener);
        return () => updateListenersRef.current.delete(listener);
      },
      pushHistory: () => {
        history.push();
      },
    };
  }, [setContentImpl]);

  const value = useMemo(
    () => ({
      editor,
      rootRef,
    }),
    [editor],
  );

  return (
    <EditorContext.Provider value={value}>
      {children}
      {onReady && <EditorReadyEffect onReady={onReady} editor={editor} />}
    </EditorContext.Provider>
  );
}

function EditorReadyEffect({ onReady, editor }: { onReady: (e: EditorApi) => void; editor: EditorApi }) {
  useEffect(() => {
    onReady(editor);
  }, [onReady, editor]);
  return null;
}

export { EditorContext };

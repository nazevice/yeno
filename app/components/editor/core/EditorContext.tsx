/**
 * Editor context – provides EditorApi (adapter over EditorEngine) and rootRef.
 */

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { renderDocument } from "../DocumentRenderer";
import { createRangeFromOffsets } from "./domSelection";
import type { EditorEngine } from "~/lib/doc/editorEngine";

export interface EditorApi {
  getRootElement: () => HTMLElement | null;
  getTextContent: () => string;
  getHTML: () => string;
  getContent: () => { text: string; html: string };
  setContent: (text: string, ranges?: unknown[], assets?: unknown[]) => void;
  execFormat: (cmd: string, value?: string) => void;
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
  editor: EditorApi;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorApi | null {
  const ctx = useContext(EditorContext);
  return ctx?.editor ?? null;
}

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorContext must be used within EditorProvider");
  return ctx;
}

export function EditorProvider({
  children,
  engine,
  getAssetDataUrl = () => null,
}: {
  children: ReactNode;
  engine: EditorEngine;
  getAssetDataUrl?: (name: string) => string | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const editor = useMemo((): EditorApi => {
    return {
      getRootElement: () => rootRef.current,
      getTextContent: () => engine.textBuffer.getText(),
      getHTML: () => rootRef.current?.innerHTML ?? "",
      getContent: () => ({
        text: engine.textBuffer.getText(),
        html: rootRef.current?.innerHTML ?? "",
      }),
      setContent: (text: string) => engine.loadPlainText(text),
      execFormat: () => {},
      insertTable: () => {},
      insertImage: (name: string, alt: string) => {
        engine.insertImage({ name, alt });
      },
      focus: () => rootRef.current?.focus(),
      undo: () => engine.undo(),
      redo: () => engine.redo(),
      get canUndo() {
        return engine.canUndo;
      },
      get canRedo() {
        return engine.canRedo;
      },
      registerUpdateListener: () => () => {},
      pushHistory: () => engine.pushHistory(),
    };
  }, [engine]);

  const render = () => {
    const root = rootRef.current;
    if (!root) return;
    const hadSelection = engine.getSelectionOffsets();
    renderDocument(root, engine.tree, engine.textBuffer, getAssetDataUrl);
    if (hadSelection) {
      const range = createRangeFromOffsets(root, hadSelection.anchor, hadSelection.focus);
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      root.focus();
    }
  };

  useEffect(() => {
    const unsub = engine.subscribe(render);
    render();
    return unsub;
  }, [engine]);

  const value = useMemo(
    (): EditorContextValue => ({ editor, engine, rootRef }),
    [editor, engine],
  );

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

export { EditorContext };

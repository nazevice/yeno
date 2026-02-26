import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { EditorService } from "~/lib/application/EditorService";
import { TextAttributes } from "~/lib/domain/document/value-objects/TextAttributes";
import type { Document } from "~/lib/domain/document/Document";
import type { Selection } from "~/lib/application/SelectionManager";
import type { AssetRef } from "~/lib/domain/document/entities/Image";

export interface EditorApi {
  getRootElement: () => HTMLElement | null;
  getDocument: () => Document | null;
  getTextContent: () => string;
  getHTML: () => string;
  getContent: () => { text: string; html: string };
  setContent: (text: string) => void;
  execFormat: (cmd: string, value?: string) => void;
  execFormatWithSelection: (anchor: number, focus: number, cmd: string, value?: string) => void;
  insertTable: (rows: number, cols: number, includeHeaders: boolean) => void;
  insertImage: (assetRef: AssetRef) => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  registerUpdateListener: (listener: () => void) => () => void;
  getActiveMarks: () => { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; font?: string | undefined; fontSize?: number | undefined } | null;
  getSelection: () => Selection | null;
  getSelectionOffsets: () => { anchor: number; focus: number } | null;
  setSelectionFromOffsets: (anchor: number, focus: number) => void;
  insertText: (text: string) => void;
  deleteBackward: () => void;
  deleteForward: () => void;
  splitBlock: () => void;
  mergeBlocks: () => void;
}

type EditorContextValue = {
  editor: EditorApi;
  service: EditorService;
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
  service,
  rootRef: externalRootRef,
}: {
  children: ReactNode;
  service: EditorService;
  rootRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const internalRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = externalRootRef ?? internalRootRef;

  const editor = useMemo((): EditorApi => {
    return {
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
        } else if (cmd === "underline") {
          service.toggleUnderline();
        } else if (cmd === "font" && value !== undefined) {
          service.formatText(TextAttributes.from({ font: value || undefined }));
        } else if (cmd === "fontSize" && value !== undefined) {
          const px = value ? Number.parseInt(value, 10) : 16;
          if (!Number.isNaN(px)) {
            service.formatText(TextAttributes.from({ fontSize: px }));
          }
        } else if (cmd === "textAlign" && value) {
          service.setTextAlign(value as "left" | "center" | "right" | "justify");
        } else if (cmd === "heading" && value) {
          const level = Number(value) as 1 | 2 | 3;
          if (level >= 1 && level <= 3) {
            service.setBlockType("heading", level);
          }
        } else if (cmd === "paragraph") {
          service.setBlockType("paragraph");
        }
      },
      execFormatWithSelection: (anchor: number, focus: number, cmd: string, value?: string) => {
        service.setSelectionFromOffsets(anchor, focus);
        if (cmd === "bold") {
          service.toggleBold();
        } else if (cmd === "italic") {
          service.toggleItalic();
        } else if (cmd === "underline") {
          service.toggleUnderline();
        } else if (cmd === "font" && value !== undefined) {
          service.formatText(TextAttributes.from({ font: value || undefined }));
        } else if (cmd === "fontSize" && value !== undefined) {
          const px = value ? Number.parseInt(value.replace(/px$/i, ""), 10) : 16;
          if (!Number.isNaN(px)) {
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
      get canUndo() {
        return service.canUndo;
      },
      get canRedo() {
        return service.canRedo;
      },
      registerUpdateListener: (listener: () => void) => service.subscribe(listener),
      getActiveMarks: () => {
        const marks = service.activeMarks;
        if (!marks) return null;
        const result: { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; font?: string | undefined; fontSize?: number | undefined } = {};
        if (marks.bold !== undefined) result.bold = marks.bold;
        if (marks.italic !== undefined) result.italic = marks.italic;
        if (marks.underline !== undefined) result.underline = marks.underline;
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
  }, [service]);

  const value = useMemo(
    (): EditorContextValue => ({ editor, service, rootRef }),
    [editor, service],
  );

  useEffect(() => {
    (window as unknown as { __editor?: EditorApi }).__editor = editor;
    return () => {
      delete (window as unknown as { __editor?: EditorApi }).__editor;
    };
  }, [editor]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

export { EditorContext };

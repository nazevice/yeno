/**
 * ContentEditable root – model-first editor.
 * Intercepts input, applies to service, relies on context to re-render.
 */

import { useCallback, useEffect, useRef } from "react";
import { useEditorContext } from "./EditorContext";
import { getSelectionOffsets } from "./domSelection";
import { renderDocument } from "../DocumentRenderer";

interface ContentEditableRootProps {
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
  onPaste?: (event: React.ClipboardEvent) => void;
  getAssetDataUrl?: (name: string) => string | null;
}

export function ContentEditableRoot({
  className,
  style,
  "data-testid": dataTestId,
  onPaste,
  getAssetDataUrl,
}: ContentEditableRootProps) {
  const { editor, service, rootRef } = useEditorContext();
  const isComposingRef = useRef(false);
  const isApplyingChangeRef = useRef(false);

  useEffect(() => {
    const render = () => {
      const root = rootRef.current;
      const doc = service.getDocument();
      if (!root || !doc) return;
      renderDocument(root, doc, getAssetDataUrl);
    };

    const unsub = service.subscribe(render);
    render();
    return unsub;
  }, [service, rootRef, getAssetDataUrl]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const syncSelection = () => {
      if (isApplyingChangeRef.current) return;
      const root = rootRef.current;
      if (!root) return;
      const sel = getSelectionOffsets(root);
      if (sel) {
        service.setSelectionFromOffsets(sel.anchor, sel.focus);
      }
    };
    
    const handleSelectionChange = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(syncSelection, 0);
    };
    
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [service, rootRef]);

  const handleBeforeInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (isComposingRef.current) return;

      const offsets = editor.getSelectionOffsets();
      if (!offsets) return;
      const { anchor, focus } = offsets;
      const isCollapsed = anchor === focus;

      const nativeEvent = e.nativeEvent as InputEvent & { type?: string; key?: string };
      let inputType = nativeEvent.inputType ?? (nativeEvent.type === "textInput" ? "insertText" : undefined);
      let data = nativeEvent.data ?? "";
      
      if (nativeEvent.type === "keypress" && nativeEvent.key) {
        inputType = "insertText";
        data = nativeEvent.key;
      }

      if (inputType === "insertText" || inputType === "insertCompositionText") {
        e.preventDefault();
        isApplyingChangeRef.current = true;
        editor.insertText(data);
        const newOffset = anchor + data.length;
        service.setSelectionFromOffsets(newOffset, newOffset);
        setTimeout(() => { isApplyingChangeRef.current = false; }, 50);
        return;
      }

      if (inputType === "deleteContentBackward" && isCollapsed) {
        e.preventDefault();
        if (anchor <= 0) return;
        isApplyingChangeRef.current = true;
        editor.deleteBackward();
        service.setSelectionFromOffsets(anchor - 1, anchor - 1);
        setTimeout(() => { isApplyingChangeRef.current = false; }, 50);
        return;
      }

      if (inputType === "deleteContentForward" && isCollapsed) {
        e.preventDefault();
        const textLen = service.getDocument()?.getText().length ?? 0;
        if (anchor >= textLen) return;
        isApplyingChangeRef.current = true;
        editor.deleteForward();
        service.setSelectionFromOffsets(anchor, anchor);
        setTimeout(() => { isApplyingChangeRef.current = false; }, 50);
        return;
      }

      if (inputType === "insertParagraph") {
        e.preventDefault();
        isApplyingChangeRef.current = true;
        editor.splitBlock();
        setTimeout(() => { isApplyingChangeRef.current = false; }, 50);
        return;
      }
    },
    [editor, service],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            editor.redo();
          } else {
            editor.undo();
          }
          return;
        }
        if (e.key === "y") {
          e.preventDefault();
          editor.redo();
          return;
        }
        if (e.key === "b") {
          e.preventDefault();
          editor.execFormat("bold");
          return;
        }
        if (e.key === "i") {
          e.preventDefault();
          editor.execFormat("italic");
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        editor.splitBlock();
        return;
      }

      if (e.key === "Backspace") {
        const offsets = editor.getSelectionOffsets();
        if (offsets && offsets.anchor === offsets.focus && offsets.anchor === 0) {
          e.preventDefault();
          editor.mergeBlocks();
          return;
        }
      }
    },
    [editor],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);
  
  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  return (
    <div
      ref={rootRef}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-testid={dataTestId}
      onBeforeInput={handleBeforeInput}
      onKeyDown={handleKeyDown}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onPaste={onPaste}
    />
  );
}

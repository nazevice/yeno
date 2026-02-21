/**
 * ContentEditable root – model-first editor.
 * Intercepts input, applies to engine, relies on context to re-render.
 */

import { useCallback, useRef } from "react";
import { useEditorContext } from "./EditorContext";
import { getSelectionOffsets } from "./domSelection";
import { resolveBufferOffset } from "~/lib/doc/treeUtils";

interface ContentEditableRootProps {
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
  onPaste?: (event: React.ClipboardEvent) => void;
}

export function ContentEditableRoot({
  className,
  style,
  "data-testid": dataTestId,
  onPaste,
}: ContentEditableRootProps) {
  const { editor, engine, rootRef } = useEditorContext();
  const isComposingRef = useRef(false);

  const handleBeforeInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (isComposingRef.current) return;
      const root = rootRef.current;
      if (!root) return;

      const sel = getSelectionOffsets(root);
      if (!sel) return;

      const { anchor, focus } = sel;
      const isCollapsed = anchor === focus;

      if (e.nativeEvent instanceof InputEvent) {
        const inputType = e.nativeEvent.inputType;
        const data = e.nativeEvent.data ?? "";

        if (inputType === "insertText" || inputType === "insertCompositionText") {
          e.preventDefault();
          const resolved = resolveBufferOffset(engine.tree, anchor);
          if (!resolved) return;
          engine.pushHistory();
          const ok = engine.apply({
            type: "insert",
            nodeId: resolved.nodeId,
            offset: resolved.nodeOffset,
            text: data,
          });
          if (ok) {
            engine.setSelectionFromOffsets(anchor + data.length, focus + data.length);
          }
          return;
        }

        if (inputType === "deleteContentBackward" && isCollapsed) {
          e.preventDefault();
          if (anchor <= 0) return;
          const resolved = resolveBufferOffset(engine.tree, anchor - 1);
          if (!resolved) return;
          engine.pushHistory();
          const ok = engine.apply({
            type: "delete",
            nodeId: resolved.nodeId,
            offset: resolved.nodeOffset,
            len: 1,
          });
          if (ok) {
            engine.setSelectionFromOffsets(anchor - 1, anchor - 1);
          }
          return;
        }

        if (inputType === "deleteContentForward" && isCollapsed) {
          e.preventDefault();
          const textLen = engine.textBuffer.getText().length;
          if (anchor >= textLen) return;
          const resolved = resolveBufferOffset(engine.tree, anchor);
          if (!resolved) return;
          engine.pushHistory();
          const ok = engine.apply({
            type: "delete",
            nodeId: resolved.nodeId,
            offset: resolved.nodeOffset,
            len: 1,
          });
          if (ok) {
            engine.setSelectionFromOffsets(anchor, anchor);
          }
          return;
        }
      }
    },
    [engine, rootRef],
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

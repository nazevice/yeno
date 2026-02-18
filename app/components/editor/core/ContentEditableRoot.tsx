import { useCallback, useRef, useLayoutEffect } from "react";
import { useEditorContext } from "./EditorContext";
import { createParagraphElement } from "./blockUtils";

interface ContentEditableRootProps {
  className?: string;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  "data-testid"?: string;
  onPaste?: (event: React.ClipboardEvent) => void;
}

export function ContentEditableRoot({
  className,
  style,
  placeholder,
  "data-testid": dataTestId,
  onPaste,
}: ContentEditableRootProps) {
  const { editor, rootRef } = useEditorContext();
  const isComposingRef = useRef(false);

  const handleBeforeInput = useCallback(() => {
    if (isComposingRef.current) return;
    editor?.pushHistory();
  }, [editor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            editor?.redo();
          } else {
            editor?.undo();
          }
          return;
        }
        if (e.key === "y") {
          e.preventDefault();
          editor?.redo();
          return;
        }
        if (e.key === "b") {
          e.preventDefault();
          editor?.execFormat("bold");
          return;
        }
        if (e.key === "i") {
          e.preventDefault();
          editor?.execFormat("italic");
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

  // Ensure empty editor has a paragraph
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (root.childNodes.length === 0) {
      const p = createParagraphElement();
      p.innerHTML = "<br>";
      root.appendChild(p);
    }
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

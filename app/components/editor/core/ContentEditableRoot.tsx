/**
 * ContentEditable root – model-first editor.
 * Intercepts input, applies to service, relies on context to re-render.
 */

import { memo, useCallback, useEffect, useRef } from "react";
import { useEditorContext } from "./EditorContext";
import { getSelectionOffsets, getTextContentFromDOM, applySelectionFromOffsets } from "./domSelection";
import { renderDocument } from "../DocumentRenderer";
import { parseHtml } from "~/lib/domain/clipboard";

const CLIPBOARD_MIME_TYPE = "application/x-yeno-document";

interface ContentEditableRootProps {
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
  onPaste?: (event: React.ClipboardEvent) => void;
  getAssetDataUrl?: (name: string) => string | null;
}

function ContentEditableRootInner({
  className,
  style,
  "data-testid": dataTestId,
  onPaste,
  getAssetDataUrl,
}: ContentEditableRootProps) {
  const { editor, service, rootRef } = useEditorContext();
  const isComposingRef = useRef(false);
  const isApplyingChangeRef = useRef(false);
  const handledByKeyDownRef = useRef(false);
  const handledByBeforeInputRef = useRef(false);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const render = () => {
      const root = rootRef.current;
      const doc = service.getDocument();
      if (!root || !doc) return;
      const hadSelection = service.selection;
      renderDocument(root, doc, getAssetDataUrl);
      if (hadSelection) {
        const offsets = service.selection;
        if (offsets) {
          const block = doc.getBlock(offsets.anchor.blockId);
          if (block) {
            const range = doc.getBlockRange(offsets.anchor.blockId);
            if (range) {
              const anchor = range.start + offsets.anchor.offset;
              const focus = range.start + offsets.focus.offset;
              requestAnimationFrame(() => {
                if (applySelectionFromOffsets(root, anchor, focus)) {
                  const sel = window.getSelection();
                  const inTableCell = sel?.anchorNode?.parentElement?.closest('td, th');
                  if (!inTableCell) {
                    root.focus();
                  }
                }
              });
            }
          }
        }
      }
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
      if (isComposingRef.current || handledByKeyDownRef.current) return;

      let offsets = editor.getSelectionOffsets();
      if (!offsets && rootRef.current) {
        const domOffsets = getSelectionOffsets(rootRef.current);
        if (domOffsets) {
          service.setSelectionFromOffsets(domOffsets.anchor, domOffsets.focus);
          offsets = domOffsets;
        }
      }
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
        handledByBeforeInputRef.current = true;
        isApplyingChangeRef.current = true;
        editor.insertText(data);
        const newOffset = anchor + data.length;
        service.setSelectionFromOffsets(newOffset, newOffset);
        setTimeout(() => {
          isApplyingChangeRef.current = false;
          handledByBeforeInputRef.current = false;
        }, 50);
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
    [editor, service, rootRef],
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
        if (e.key === "u") {
          e.preventDefault();
          editor.execFormat("underline");
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

      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !e.repeat) {
        if (handledByBeforeInputRef.current) return;
        e.preventDefault();
        handledByKeyDownRef.current = true;
        let offsets = editor.getSelectionOffsets();
        if (!offsets && rootRef.current) {
          const domOffsets = getSelectionOffsets(rootRef.current);
          if (domOffsets) {
            service.setSelectionFromOffsets(domOffsets.anchor, domOffsets.focus);
            offsets = domOffsets;
          }
        }
        if (offsets) {
          isApplyingChangeRef.current = true;
          editor.insertText(e.key);
          const newOffset = offsets.anchor + 1;
          service.setSelectionFromOffsets(newOffset, newOffset);
          setTimeout(() => {
            isApplyingChangeRef.current = false;
            handledByKeyDownRef.current = false;
          }, 50);
        } else {
          handledByKeyDownRef.current = false;
        }
      }
    },
    [editor, service, rootRef],
  );

  const handleInput = useCallback(
    () => {
      if (isApplyingChangeRef.current || handledByKeyDownRef.current) return;
      const root = rootRef.current;
      if (!root) return;
      const domText = getTextContentFromDOM(root);
      const modelText = service.getDocument()?.getText() ?? "";
      if (domText !== modelText) {
        isApplyingChangeRef.current = true;
        service.newDocument();
        const doc = service.getDocument();
        if (doc && domText) {
          service.setSelectionFromOffsets(0, 0);
          service.insertText(domText);
        }
        service.setSelectionFromOffsets(domText.length, domText.length);
        setTimeout(() => { isApplyingChangeRef.current = false; }, 0);
      }
    },
    [service, rootRef],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);
  
  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const handleCopy = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      
      const clipboardData = service.getClipboardData();
      if (!clipboardData) return;
      
      e.clipboardData.setData(CLIPBOARD_MIME_TYPE, JSON.stringify(clipboardData.json));
      e.clipboardData.setData("text/html", clipboardData.html);
      e.clipboardData.setData("text/plain", clipboardData.text);
    },
    [service],
  );

  const handleCut = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      
      const clipboardData = service.getClipboardData();
      if (!clipboardData) return;
      
      e.clipboardData.setData(CLIPBOARD_MIME_TYPE, JSON.stringify(clipboardData.json));
      e.clipboardData.setData("text/html", clipboardData.html);
      e.clipboardData.setData("text/plain", clipboardData.text);
      
      service.deleteSelection();
    },
    [service],
  );

  const handlePasteEvent = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      
      if (onPaste) {
        onPaste(e);
        return;
      }
      
      const customData = e.clipboardData.getData(CLIPBOARD_MIME_TYPE);
      if (customData) {
        try {
          const payload = JSON.parse(customData);
          service.insertFromClipboard(payload);
          return;
        } catch {
          // Fall through to other formats
        }
      }
      
      const files = e.clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              if (dataUrl) {
                service.insertImageFromDataUrl(dataUrl, file.name);
              }
            };
            reader.readAsDataURL(file);
          }
        }
        return;
      }
      
      const html = e.clipboardData.getData("text/html");
      if (html) {
        const payload = parseHtml(html);
        if (!payload.blocks.every(b => b.type === "paragraph" && b.text === "")) {
          service.insertFromClipboard(payload);
          return;
        }
      }
      
      const text = e.clipboardData.getData("text/plain");
      if (text) {
        service.insertPlainText(text);
      }
    },
    [service, onPaste],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (link && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const href = link.getAttribute("href");
        if (href) {
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className={className}
      style={style}
      contentEditable
      tabIndex={0}
      suppressContentEditableWarning
      data-testid={dataTestId}
      onBeforeInputCapture={handleBeforeInput}
      onInput={(e) => handleInput()}
      onKeyDownCapture={handleKeyDown}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePasteEvent}
      onClick={handleClick}
    />
  );
}

export const ContentEditableRoot = memo(ContentEditableRootInner);

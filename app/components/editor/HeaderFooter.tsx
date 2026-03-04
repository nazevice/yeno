import { useCallback, useEffect, useRef, useState, forwardRef } from "react";
import type { HeaderFooterContent } from "~/lib/domain/document/value-objects/SectionLayout";
import { SectionLayout } from "~/lib/domain/document/value-objects/SectionLayout";

interface HeaderFooterProps {
  type: "header" | "footer";
  content: HeaderFooterContent | undefined;
  pageNumber: number;
  totalPages: number;
  pageWidth: number;
  onContentChange: (content: HeaderFooterContent) => void;
}

const TEMPLATE_VARIABLES = [
  { value: "{page}", label: "Page" },
  { value: "{total}", label: "Total" },
];

const HEADER_FOOTER_PADDING_Y = 12;
const HEADER_FOOTER_PADDING_X = 48;

export const HeaderFooter = forwardRef<HTMLDivElement, HeaderFooterProps>(
  function HeaderFooter(
    { type, content, pageNumber, totalPages, pageWidth, onContentChange },
    ref,
  ) {
    const [isEditing, setIsEditing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const savedSelectionRef = useRef<Range | null>(null);
    const prevIsEditingRef = useRef(false);

    const getDisplayText = useCallback(
      (text: string | undefined): string => {
        if (!text) return "";
        return SectionLayout.resolveTemplate(text, pageNumber, totalPages);
      },
      [pageNumber, totalPages],
    );

    const textContent = content?.center || content?.left || content?.right || "";

    const saveSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedSelectionRef.current = sel.getRangeAt(0);
      }
    }, []);

    const restoreSelection = useCallback(() => {
      if (savedSelectionRef.current) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedSelectionRef.current);
      }
    }, []);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      if (isEditing) return;
      setIsEditing(true);
    }, [isEditing]);

    const handleDone = useCallback(() => {
      const contentEl = contentRef.current;
      if (!contentEl) return;

      const html = contentEl.innerHTML;
      onContentChange(html ? { center: html } : {});
      setIsEditing(false);
      savedSelectionRef.current = null;
    }, [onContentChange]);

    const insertVariable = useCallback((variable: string) => {
      const contentEl = contentRef.current;
      if (!contentEl) return;

      contentEl.focus();
      restoreSelection();

      const selection = window.getSelection();
      if (!selection) return;

      const range = savedSelectionRef.current ?? selection.getRangeAt(0);
      range.deleteContents();

      const textNode = document.createTextNode(variable);
      range.insertNode(textNode);

      const newRange = document.createRange();
      newRange.setStartAfter(textNode);
      newRange.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(newRange);
      savedSelectionRef.current = newRange;

      contentEl.scrollTop = contentEl.scrollHeight;
    }, [restoreSelection]);

    const handleBlur = useCallback((e: React.FocusEvent) => {
      if (toolbarRef.current?.contains(e.relatedTarget)) {
        return;
      }

      const contentEl = contentRef.current;
      if (!contentEl) return;

      const html = contentEl.innerHTML;
      onContentChange(html ? { center: html } : {});
      setIsEditing(false);
      savedSelectionRef.current = null;
    }, [onContentChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsEditing(false);
          savedSelectionRef.current = null;
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;

          const range = selection.getRangeAt(0);
          range.deleteContents();

          const br = document.createElement("br");
          range.insertNode(br);

          const newRange = document.createRange();
          newRange.setStartAfter(br);
          newRange.setEndAfter(br);
          selection.removeAllRanges();
          selection.addRange(newRange);
          savedSelectionRef.current = newRange;
          return;
        }

        saveSelection();
      },
      [saveSelection],
    );

    useEffect(() => {
      const contentEl = contentRef.current;
      if (!contentEl) return;

      const isEnteringEditMode = isEditing && !prevIsEditingRef.current;
      prevIsEditingRef.current = isEditing;

      if (isEnteringEditMode) {
        contentEl.innerHTML = textContent;
        contentEl.focus();

        const range = document.createRange();
        const sel = window.getSelection();

        if (contentEl.childNodes.length > 0) {
          range.selectNodeContents(contentEl);
        } else {
          range.setStart(contentEl, 0);
          range.setEnd(contentEl, 0);
        }

        sel?.removeAllRanges();
        sel?.addRange(range);
        savedSelectionRef.current = range;
      } else if (!isEditing) {
        contentEl.innerHTML = getDisplayText(textContent);
      }
    }, [isEditing, textContent, getDisplayText]);

    const hasContent = !!textContent;

    if (!hasContent && !isEditing) {
      return (
        <div
          ref={ref}
          className="flex items-center justify-center text-[10px] text-zinc-300 cursor-pointer select-none hover:text-zinc-400"
          style={{
            paddingTop: HEADER_FOOTER_PADDING_Y,
            paddingBottom: HEADER_FOOTER_PADDING_Y,
            paddingLeft: HEADER_FOOTER_PADDING_X,
            paddingRight: HEADER_FOOTER_PADDING_X,
            minHeight: 24,
          }}
          onDoubleClick={handleDoubleClick}
          title={`Double-click to add ${type}`}
        >
          <span>Double-click to add {type}</span>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className="flex flex-col items-center text-[10px] text-zinc-500"
        style={{
          paddingTop: HEADER_FOOTER_PADDING_Y,
          paddingBottom: HEADER_FOOTER_PADDING_Y,
          paddingLeft: HEADER_FOOTER_PADDING_X,
          paddingRight: HEADER_FOOTER_PADDING_X,
        }}
      >
        {isEditing && (
          <div
            ref={toolbarRef}
            className="flex items-center gap-0.5 bg-white border border-zinc-200 rounded-md shadow-sm px-1 py-0.5 z-10 mb-1"
          >
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.value}
                type="button"
                className="px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100 rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertVariable(v.value);
                }}
                title={`Insert ${v.label.toLowerCase()}`}
              >
                {v.label}
              </button>
            ))}
            <div className="w-px h-4 bg-zinc-200 mx-0.5" />
            <button
              type="button"
              className="px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded font-medium"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        )}
        <div
          ref={contentRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          className={`outline-none w-full text-center ${
            isEditing
              ? "bg-white px-2 py-1 rounded shadow-sm border border-blue-200 min-h-[20px]"
              : "cursor-default"
          }`}
          onDoubleClick={handleDoubleClick}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onInput={saveSelection}
          onMouseUp={saveSelection}
        />
      </div>
    );
  },
);

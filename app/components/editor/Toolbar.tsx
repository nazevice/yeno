import { useEffect, useRef, useState } from "react";

import {
  clampFontSizePx,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  parseFontSizePx,
} from "~/lib/doc/fonts";
import { TOGGLE_MODE_SHORTCUT } from "~/lib/doc/hotkeys";
import type { EditorMode } from "~/lib/doc/schema";
import type { EditorApi } from "./core/EditorContext";

interface ToolbarProps {
  editor: EditorApi | null;
  mode: EditorMode;
  onToggleMode: () => void;
  onInsertImage: () => void;
  pageWidthPx: number;
  pageHeightPx: number;
  onPageWidthChange: (px: number) => void;
  onPageHeightChange: (px: number) => void;
  continuousWidthPx: number;
  onContinuousWidthChange: (px: number) => void;
}

function getSelectionFontInfo(): { font: string; fontSize: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || !(node instanceof HTMLElement)) return null;
  let el: HTMLElement | null = node as HTMLElement;
  while (el) {
    const font = el.style?.fontFamily || getComputedStyle(el).fontFamily;
    const fs = el.style?.fontSize || getComputedStyle(el).fontSize;
    if (font || fs) {
      return {
        font: font?.split(",")[0]?.trim().replace(/['"]/g, "") || DEFAULT_FONT,
        fontSize: fs || DEFAULT_FONT_SIZE,
      };
    }
    el = el.parentElement;
  }
  return { font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE };
}

export function Toolbar({
  editor,
  mode,
  onToggleMode,
  onInsertImage,
  pageWidthPx,
  pageHeightPx,
  onPageWidthChange,
  onPageHeightChange,
  continuousWidthPx,
  onContinuousWidthChange,
}: ToolbarProps) {
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT);
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE);
  const [isFontSizeMixed, setIsFontSizeMixed] = useState(false);
  const [isCustomFontSize, setIsCustomFontSize] = useState(false);
  const [customFontSizePx, setCustomFontSizePx] = useState("");
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showSizePopover, setShowSizePopover] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(4);
  const [tableIncludeHeaders, setTableIncludeHeaders] = useState(true);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const sizePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const updateFromSelection = () => {
      const info = getSelectionFontInfo();
      if (info) {
        setCurrentFont((prev) => (info.font === prev ? prev : info.font));
        setCurrentFontSize((prev) => (info.fontSize === prev ? prev : info.fontSize));
        const isPreset = FONT_SIZE_OPTIONS.some(
          (o) => o.value === info.fontSize && o.value !== "custom",
        );
        setIsCustomFontSize(!isPreset && info.fontSize !== DEFAULT_FONT_SIZE);
        if (!isPreset && info.fontSize !== DEFAULT_FONT_SIZE) {
          const px = Number.parseInt(info.fontSize, 10);
          if (!Number.isNaN(px)) setCustomFontSizePx(String(px));
        }
      }
    };
    const unregister = editor.registerUpdateListener(updateFromSelection);
    document.addEventListener("selectionchange", updateFromSelection);
    return () => {
      unregister();
      document.removeEventListener("selectionchange", updateFromSelection);
    };
  }, [editor]);

  const run = (fn: (editor: EditorApi) => void) => {
    if (!editor) return;
    fn(editor);
  };

  const onFontChange = (value: string) => {
    run((e) => e.execFormat("font", value));
  };

  const onFontSizeChange = (value: string) => {
    if (value === "custom") {
      setIsCustomFontSize(true);
      return;
    }
    setIsCustomFontSize(false);
    run((e) => e.execFormat("fontSize", value === "default" ? "" : value));
  };

  const onCustomFontSizeApply = () => {
    const px = parseFontSizePx(customFontSizePx);
    if (px === null) {
      setIsCustomFontSize(false);
      return;
    }
    const value = `${clampFontSizePx(px)}px`;
    setIsCustomFontSize(false);
    setCurrentFontSize(value);
    run((e) => e.execFormat("fontSize", value));
  };

  const onInsertTable = () => {
    run((e) => {
      e.focus();
      e.insertTable(tableRows, tableCols, tableIncludeHeaders);
    });
    setShowTablePicker(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showInsertMenu && insertMenuRef.current && !insertMenuRef.current.contains(target)) {
        setShowInsertMenu(false);
        setShowTablePicker(false);
      }
      if (showSizePopover && sizePopoverRef.current && !sizePopoverRef.current.contains(target)) {
        setShowSizePopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showInsertMenu, showSizePopover]);

  return (
    <div className="toolbar">
      {/* Edit */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.undo())}
          title="Undo"
        >
          Undo
        </button>
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.redo())}
          title="Redo"
        >
          Redo
        </button>
      </div>
      <span className="toolbar-divider" />

      {/* Format */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.execFormat("bold"))}
          title="Bold"
        >
          B
        </button>
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.execFormat("italic"))}
          title="Italic"
        >
          I
        </button>
      </div>
      <span className="toolbar-divider" />

      {/* Style */}
      <div className="toolbar-group">
        <select
          className="toolbar-select min-w-[5.5rem]"
          value={FONT_OPTIONS.some((o) => o.value === currentFont) ? currentFont : DEFAULT_FONT}
          onChange={(e) => onFontChange(e.target.value)}
          title="Font"
        >
          {FONT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <select
            className="toolbar-select min-w-[4rem]"
            value={
              isFontSizeMixed
                ? "mixed"
                : isCustomFontSize
                  ? "custom"
                  : FONT_SIZE_OPTIONS.some(
                        (o) => o.value === currentFontSize && o.value !== "custom",
                      )
                    ? currentFontSize
                    : "default"
            }
            onChange={(e) => onFontSizeChange(e.target.value)}
            title="Size"
          >
            <option value="mixed" disabled>
              —
            </option>
            {FONT_SIZE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {isCustomFontSize && (
            <>
              <input
                type="number"
                min={8}
                max={96}
                value={customFontSizePx}
                onChange={(e) => setCustomFontSizePx(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCustomFontSizeApply()}
                onBlur={onCustomFontSizeApply}
                className="h-8 w-12 rounded-lg border-0 bg-zinc-100/80 px-1.5 text-center text-[12px] text-zinc-700 hover:bg-zinc-100"
                placeholder="px"
                aria-label="Custom size"
              />
            </>
          )}
        </div>
      </div>
      <span className="toolbar-divider" />

      {/* Block */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.execFormat("blockType", "h1"))}
          title="Heading 1"
        >
          H1
        </button>
        <button
          className="toolbar-btn-minimal"
          onClick={() => run((e) => e.execFormat("blockType", "h2"))}
          title="Heading 2"
        >
          H2
        </button>
      </div>
      <span className="toolbar-divider" />

      {/* Insert */}
      <div className="relative" ref={insertMenuRef}>
        <button
          className="toolbar-btn-minimal"
          onClick={() => {
            setShowInsertMenu((p) => !p);
            if (showInsertMenu) setShowTablePicker(false);
          }}
          title="Insert"
        >
          Insert
        </button>
        {showInsertMenu && (
          <div
            className="toolbar-popover left-0"
            data-testid="insert-menu"
            style={{ minWidth: showTablePicker ? "12rem" : "11rem" }}
          >
            {showTablePicker ? (
              <div>
                <button
                  className="mb-2 text-[11px] text-zinc-400 hover:text-zinc-600"
                  onClick={() => setShowTablePicker(false)}
                >
                  ← Back
                </button>
                <div className="mb-2 grid grid-cols-2 gap-2 text-[12px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-zinc-500">Rows</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={tableRows}
                      onChange={(e) =>
                        setTableRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-zinc-500">Columns</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={tableCols}
                      onChange={(e) =>
                        setTableCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900"
                    />
                  </label>
                </div>
                <label className="mb-3 flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={tableIncludeHeaders}
                    onChange={(e) => setTableIncludeHeaders(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  <span className="text-zinc-500">Header row</span>
                </label>
                <button
                  className="w-full rounded-lg bg-zinc-900 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
                  onClick={() => {
                    onInsertTable();
                    setShowInsertMenu(false);
                    setShowTablePicker(false);
                  }}
                  data-testid="table-picker-insert"
                >
                  Insert
                </button>
              </div>
            ) : (
              <>
                <button
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100"
                  onClick={() => setShowTablePicker(true)}
                >
                  Table
                </button>
                <button
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100"
                  onClick={() => {
                    onInsertImage();
                    setShowInsertMenu(false);
                  }}
                >
                  Image
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* View mode */}
        <div className="toolbar-segmented" role="group" aria-label="View mode">
          <button
            className="toolbar-segment"
            data-active={mode === "continuous"}
            onClick={() => mode !== "continuous" && onToggleMode()}
            title={`Continuous ${TOGGLE_MODE_SHORTCUT}`}
          >
            Continuous
          </button>
          <button
            className="toolbar-segment"
            data-active={mode === "paginated"}
            onClick={() => mode !== "paginated" && onToggleMode()}
            title={`Page ${TOGGLE_MODE_SHORTCUT}`}
          >
            Page
          </button>
        </div>

        {/* Dimensions popover */}
        <div className="relative" ref={sizePopoverRef}>
          <button
            className="toolbar-btn-minimal text-zinc-500"
            onClick={() => setShowSizePopover((p) => !p)}
            title="Page size"
            aria-label="Dimensions"
          >
            {mode === "paginated"
              ? `${pageWidthPx} × ${pageHeightPx}`
              : `${continuousWidthPx}px`}
          </button>
          {showSizePopover && (
            <div className="toolbar-popover" style={{ minWidth: "8.5rem" }}>
              {mode === "paginated" ? (
                <div className="space-y-2">
                  <label className="flex flex-col gap-0.5 text-[12px]">
                    <span className="text-zinc-500">Width</span>
                    <input
                      type="number"
                      min={200}
                      max={2000}
                      value={pageWidthPx}
                      onChange={(e) =>
                        onPageWidthChange(Number(e.target.value) || 794)
                      }
                      onBlur={(e) =>
                        onPageWidthChange(Number(e.target.value) || 794)
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[12px]">
                    <span className="text-zinc-500">Height</span>
                    <input
                      type="number"
                      min={300}
                      max={2000}
                      value={pageHeightPx}
                      onChange={(e) =>
                        onPageHeightChange(Number(e.target.value) || 1123)
                      }
                      onBlur={(e) =>
                        onPageHeightChange(Number(e.target.value) || 1123)
                      }
                      className="rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900"
                    />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col gap-0.5 text-[12px]">
                  <span className="text-zinc-500">Width</span>
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    value={continuousWidthPx}
                    onChange={(e) =>
                      onContinuousWidthChange(Number(e.target.value) || 896)
                    }
                    onBlur={(e) =>
                      onContinuousWidthChange(Number(e.target.value) || 896)
                    }
                    className="rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-900"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

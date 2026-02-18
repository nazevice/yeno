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

export function Toolbar({ editor, mode, onToggleMode, onInsertImage }: ToolbarProps) {
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT);
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE);
  const [isFontSizeMixed, setIsFontSizeMixed] = useState(false);
  const [isCustomFontSize, setIsCustomFontSize] = useState(false);
  const [customFontSizePx, setCustomFontSizePx] = useState("");
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(4);
  const [tableIncludeHeaders, setTableIncludeHeaders] = useState(true);
  const tablePickerRef = useRef<HTMLDivElement>(null);

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
    if (!showTablePicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(event.target as Node)) {
        setShowTablePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTablePicker]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 p-3 shadow-sm">
      <button className="toolbar-btn" onClick={() => run((e) => e.undo())}>
        Undo
      </button>
      <button className="toolbar-btn" onClick={() => run((e) => e.redo())}>
        Redo
      </button>
      <span className="mx-1 h-6 w-px bg-zinc-300" />
      <button className="toolbar-btn" onClick={() => run((e) => e.execFormat("bold"))}>
        Bold
      </button>
      <button className="toolbar-btn" onClick={() => run((e) => e.execFormat("italic"))}>
        Italic
      </button>
      <select
        className="toolbar-btn min-w-[7rem] cursor-pointer"
        value={FONT_OPTIONS.some((o) => o.value === currentFont) ? currentFont : DEFAULT_FONT}
        onChange={(e) => onFontChange(e.target.value)}
        title="Font family"
      >
        {FONT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <select
          className="toolbar-btn min-w-[5rem] cursor-pointer"
          value={
            isFontSizeMixed
              ? "mixed"
              : isCustomFontSize
                ? "custom"
                : FONT_SIZE_OPTIONS.some((o) => o.value === currentFontSize && o.value !== "custom")
                  ? currentFontSize
                  : "default"
          }
          onChange={(e) => onFontSizeChange(e.target.value)}
          title="Font size"
        >
          <option value="mixed" disabled>
            Mixed
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
              className="toolbar-btn w-14 px-1 text-center"
              placeholder="px"
              aria-label="Custom font size (8–96)"
            />
            <span className="text-sm text-zinc-500">px</span>
          </>
        )}
      </div>
      <button className="toolbar-btn" onClick={() => run((e) => e.execFormat("blockType", "h1"))}>
        H1
      </button>
      <button className="toolbar-btn" onClick={() => run((e) => e.execFormat("blockType", "h2"))}>
        H2
      </button>
      <div className="relative" ref={tablePickerRef}>
        <button
          className="toolbar-btn"
          onClick={() => setShowTablePicker((prev) => !prev)}
          title="Insert table"
          aria-expanded={showTablePicker}
          aria-haspopup="dialog"
          data-testid="insert-table-btn"
        >
          Insert Table
        </button>
        {showTablePicker && (
          <div
            className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-zinc-200 bg-white p-3 shadow-lg"
            data-testid="table-picker"
          >
            <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-0.5">
                <span className="text-zinc-600">Rows</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="rounded border border-zinc-300 px-2 py-1 text-zinc-900"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-zinc-600">Columns</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  className="rounded border border-zinc-300 px-2 py-1 text-zinc-900"
                />
              </label>
            </div>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tableIncludeHeaders}
                onChange={(e) => setTableIncludeHeaders(e.target.checked)}
                className="rounded border-zinc-300"
              />
              <span className="text-zinc-600">Header row</span>
            </label>
            <button
              className="w-full rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              onClick={onInsertTable}
              data-testid="table-picker-insert"
            >
              Insert
            </button>
          </div>
        )}
      </div>
      <button className="toolbar-btn" onClick={onInsertImage}>
        Insert Image
      </button>
      <span className="ml-auto rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
        {mode === "paginated" ? "Pagination mode" : "Continuous mode"} - {TOGGLE_MODE_SHORTCUT}
      </span>
      <button className="toolbar-btn" onClick={onToggleMode}>
        Toggle View
      </button>
    </div>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  clampFontSizePx,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  parseFontSizePx,
} from "~/lib/doc/fonts";
import type { EditorApi } from "./core/EditorContext";
import { useEditor } from "./core/EditorContext";
import { getSelectionOffsets } from "./core/domSelection";
import { LinkDialog } from "./LinkDialog";
import { ColorPalette } from "./ColorPalette";

interface ToolbarProps {
  onInsertImage: () => void;
  onExportPdf: () => void;
  pageWidthPx: number;
  pageHeightPx: number;
  onPageWidthChange: (px: number) => void;
  onPageHeightChange: (px: number) => void;
  showDebugPanel?: boolean;
  onToggleDebugPanel?: () => void;
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

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left", title: "Align left" },
  { value: "center", label: "Center", title: "Align center" },
  { value: "right", label: "Right", title: "Align right" },
  { value: "justify", label: "Block", title: "Justify (block)" },
] as const;

function getSelectionAlignInfo(): (typeof TEXT_ALIGN_OPTIONS)[number]["value"] | "default" {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "default";
  const range = sel.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || !(node instanceof HTMLElement)) return "default";
  let el: HTMLElement | null = node as HTMLElement;
  const root = document.querySelector("[contenteditable=\"true\"]");
  while (el && el !== root) {
    const tag = el.tagName;
    if (["P", "H1", "H2", "H3", "DIV", "TD", "TH"].includes(tag)) {
      const align = el.style?.textAlign || getComputedStyle(el).textAlign;
      if (align && align !== "start") {
        const v = align.toLowerCase();
        if (v === "left" || v === "center" || v === "right" || v === "justify")
          return v as (typeof TEXT_ALIGN_OPTIONS)[number]["value"];
      }
      return "default";
    }
    el = el.parentElement;
  }
  return "default";
}

type SelectionStyle = {
  font: string;
  fontSize: string;
  align: ReturnType<typeof getSelectionAlignInfo>;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const DEFAULT_SELECTION_STYLE: SelectionStyle = {
  font: DEFAULT_FONT,
  fontSize: DEFAULT_FONT_SIZE,
  align: "default",
  bold: false,
  italic: false,
  underline: false,
};

let cachedSelectionStyle: SelectionStyle = DEFAULT_SELECTION_STYLE;

function getSelectionStyleSnapshot(editor: EditorApi | null): SelectionStyle {
  const fontInfo = getSelectionFontInfo();
  const align = getSelectionAlignInfo();
  const font = fontInfo?.font ?? DEFAULT_FONT;
  const fontSize = fontInfo?.fontSize ?? DEFAULT_FONT_SIZE;
  const marks = editor?.getActiveMarks();
  const bold = marks?.bold ?? false;
  const italic = marks?.italic ?? false;
  const underline = marks?.underline ?? false;
  
  if (
    cachedSelectionStyle.font === font &&
    cachedSelectionStyle.fontSize === fontSize &&
    cachedSelectionStyle.align === align &&
    cachedSelectionStyle.bold === bold &&
    cachedSelectionStyle.italic === italic &&
    cachedSelectionStyle.underline === underline
  ) {
    return cachedSelectionStyle;
  }
  
  cachedSelectionStyle = { font, fontSize, align, bold, italic, underline };
  return cachedSelectionStyle;
}

export function Toolbar({
  onInsertImage,
  onExportPdf,
  pageWidthPx,
  pageHeightPx,
  onPageWidthChange,
  onPageHeightChange,
  showDebugPanel,
  onToggleDebugPanel,
}: ToolbarProps) {
  const editor = useEditor();
  const selectionStyle = useSyncExternalStore(
    (callback) => {
      if (!editor) return () => {};
      const unregister = editor.registerUpdateListener(callback);
      document.addEventListener("selectionchange", callback);
      return () => {
        unregister();
        document.removeEventListener("selectionchange", callback);
      };
    },
    () => getSelectionStyleSnapshot(editor),
    () => DEFAULT_SELECTION_STYLE,
  );
  const { font: currentFont, fontSize: currentFontSize, align: currentAlign, bold: isBold, italic: isItalic, underline: isUnderline } = selectionStyle;
  const isPreset = FONT_SIZE_OPTIONS.some(
    (o) => o.value === currentFontSize && o.value !== "custom",
  );
  const isFontSizeMixed = false;
  const [isCustomFontSize, setIsCustomFontSize] = useState(false);
  const [customFontSizePx, setCustomFontSizePx] = useState("");
  const parsedSelectionPx = (() => {
    const px = Number.parseInt(currentFontSize, 10);
    return Number.isNaN(px) ? "" : String(px);
  })();
  const displayCustomFontSize = customFontSizePx || (!isPreset ? parsedSelectionPx : "");
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showSizePopover, setShowSizePopover] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [activeLinkUrl, setActiveLinkUrl] = useState<string | null>(null);
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState(3);
  const savedSelectionRef = useRef<{ anchor: number; focus: number } | null>(null);
  const [tableCols, setTableCols] = useState(4);
  const [tableIncludeHeaders, setTableIncludeHeaders] = useState(true);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const sizePopoverRef = useRef<HTMLDivElement>(null);
  const linkButtonRef = useRef<HTMLDivElement>(null);
  const colorButtonRef = useRef<HTMLDivElement>(null);

  const run = (fn: (editor: EditorApi) => void) => {
    if (!editor) return;
    fn(editor);
  };

  const saveSelectionForFormat = () => {
    if (!editor) return;
    const root = editor.getRootElement();
    if (!root) return;
    const sel = getSelectionOffsets(root);
    if (sel) savedSelectionRef.current = sel;
  };

  const onFontChange = (value: string) => {
    run((editor) => {
      const sel = savedSelectionRef.current;
      if (sel) {
        editor.execFormatWithSelection(sel.anchor, sel.focus, "font", value);
        savedSelectionRef.current = null;
      } else {
        editor.execFormat("font", value);
      }
    });
  };

  const onFontSizeChange = (value: string) => {
    if (value === "custom") {
      setIsCustomFontSize(true);
      const px = Number.parseInt(currentFontSize, 10);
      setCustomFontSizePx(Number.isNaN(px) ? "" : String(px));
      return;
    }
    setIsCustomFontSize(false);
    run((editor) => {
      const sel = savedSelectionRef.current;
      const sizeValue = value === "default" ? "" : value;
      if (sel) {
        editor.execFormatWithSelection(sel.anchor, sel.focus, "fontSize", sizeValue);
        savedSelectionRef.current = null;
      } else {
        editor.execFormat("fontSize", sizeValue);
      }
    });
  };

  const onCustomFontSizeApply = () => {
    const px = parseFontSizePx(displayCustomFontSize);
    if (px === null) {
      setIsCustomFontSize(false);
      setCustomFontSizePx("");
      return;
    }
    const value = `${clampFontSizePx(px)}px`;
    setIsCustomFontSize(false);
    setCustomFontSizePx("");
    run((editor) => {
      const sel = savedSelectionRef.current;
      if (sel) {
        editor.execFormatWithSelection(sel.anchor, sel.focus, "fontSize", value);
        savedSelectionRef.current = null;
      } else {
        editor.execFormat("fontSize", value);
      }
    });
  };

  const onInsertTable = () => {
    run((e) => {
      e.insertTable(tableRows, tableCols, tableIncludeHeaders);
      e.focus();
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

      {/* Format - use onMouseDown to prevent losing editor selection when clicking */}
      <div className="toolbar-group">
        <button
          type="button"
          className="toolbar-btn-minimal"
          onMouseDown={(e) => {
            e.preventDefault();
            run((editor) => editor.execFormat("bold"));
          }}
          title="Bold"
          data-testid="format-bold"
          data-active={isBold}
        >
          B
        </button>
        <button
          type="button"
          className="toolbar-btn-minimal"
          onMouseDown={(e) => {
            e.preventDefault();
            run((editor) => editor.execFormat("italic"));
          }}
          title="Italic"
          data-testid="format-italic"
          data-active={isItalic}
        >
          I
        </button>
        <button
          type="button"
          className="toolbar-btn-minimal"
          onMouseDown={(e) => {
            e.preventDefault();
            run((editor) => editor.execFormat("underline"));
          }}
          title="Underline"
          data-testid="format-underline"
          data-active={isUnderline}
        >
          U
        </button>
        <div className="relative" ref={linkButtonRef}>
          <button
            type="button"
            className="toolbar-btn-minimal"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelectionForFormat();
              const currentLink = editor?.getActiveLink() ?? null;
              setActiveLinkUrl(currentLink);
              setShowLinkDialog(true);
            }}
            title="Insert/Edit Link"
            data-testid="format-link"
            data-active={!!activeLinkUrl}
          >
            Link
          </button>
          <LinkDialog
            isOpen={showLinkDialog}
            initialUrl={activeLinkUrl || ""}
            onConfirm={(url) => {
              run((e) => {
                e.setLink(url);
                e.focus();
              });
              setShowLinkDialog(false);
              setActiveLinkUrl(null);
            }}
            onRemove={() => {
              run((e) => {
                e.removeLink();
                e.focus();
              });
              setShowLinkDialog(false);
              setActiveLinkUrl(null);
            }}
            onClose={() => {
              setShowLinkDialog(false);
              setActiveLinkUrl(null);
            }}
          />
        </div>
        <div className="relative" ref={colorButtonRef}>
          <button
            type="button"
            className="toolbar-btn-minimal flex items-center gap-1"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelectionForFormat();
              const currentColor = editor?.getActiveColor() ?? null;
              setActiveColor(currentColor);
              setShowColorPalette(true);
            }}
            title="Text Color"
            data-testid="format-color"
          >
            <span>A</span>
            <span
              className="h-3.5 w-4 rounded-sm border border-zinc-300"
              style={{ backgroundColor: activeColor || "#000000" }}
            />
          </button>
          <ColorPalette
            isOpen={showColorPalette}
            currentColor={activeColor}
            onSelectColor={(color) => {
              if (color) {
                run((e) => {
                  e.setColor(color);
                  e.focus();
                });
              } else {
                run((e) => {
                  e.removeColor();
                  e.focus();
                });
              }
              setShowColorPalette(false);
              setActiveColor(color ?? null);
            }}
            onClose={() => setShowColorPalette(false)}
          />
        </div>
      </div>
      <span className="toolbar-divider" />

      {/* Block type - Paragraph/Heading */}
      <div className="toolbar-group">
        <select
          className="toolbar-select min-w-[6rem]"
          onMouseDown={saveSelectionForFormat}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "paragraph") {
              run((editor) => editor.execFormat("paragraph"));
            } else if (value.startsWith("h")) {
              const level = value.slice(1);
              run((editor) => editor.execFormat("heading", level));
            }
          }}
          title="Block type"
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>
      <span className="toolbar-divider" />

      {/* Style - save selection on mousedown so format applies to selected text after dropdown closes */}
      <div className="toolbar-group">
        <select
          className="toolbar-select min-w-[5.5rem]"
          value={FONT_OPTIONS.some((o) => o.value === currentFont) ? currentFont : DEFAULT_FONT}
          onMouseDown={saveSelectionForFormat}
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
            onMouseDown={saveSelectionForFormat}
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
          {(isCustomFontSize || !isPreset) && (
            <>
              <input
                type="number"
                min={8}
                max={96}
                value={displayCustomFontSize}
                onChange={(e) => setCustomFontSizePx(e.target.value || "")}
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

      {/* Alignment */}
      <div className="toolbar-segmented" role="group" aria-label="Text alignment">
        {TEXT_ALIGN_OPTIONS.map(({ value, label, title }) => (
          <button
            key={value}
            className="toolbar-segment"
            onClick={() => run((e) => e.execFormat("textAlign", value))}
            title={title}
            data-active={
              currentAlign === value || (value === "left" && currentAlign === "default")
            }
            data-testid={`align-${value}`}
          >
            {label}
          </button>
        ))}
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
          data-testid="insert-button"
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
                  type="button"
                  className="w-full rounded-lg bg-zinc-900 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
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
                <button
                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-100"
                  onClick={() => {
                    run((e) => e.insertToc("Table of Contents"));
                    setShowInsertMenu(false);
                  }}
                >
                  Table of Contents
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="toolbar-btn-minimal"
          onClick={onExportPdf}
          title="Export to PDF (Ctrl+Shift+E)"
        >
          Export PDF
        </button>

        {onToggleDebugPanel && (
          <button
            className={`toolbar-btn-minimal ${showDebugPanel ? "bg-zinc-200" : ""}`}
            onClick={onToggleDebugPanel}
            title="Toggle debug panel"
          >
            Debug
          </button>
        )}

        {/* Dimensions popover */}
        <div className="relative" ref={sizePopoverRef}>
          <button
            className="toolbar-btn-minimal text-zinc-500"
            onClick={() => setShowSizePopover((p) => !p)}
            title="Page size"
            aria-label="Dimensions"
          >
            {`${pageWidthPx} × ${pageHeightPx}`}
          </button>
          {showSizePopover && (
            <div className="toolbar-popover" style={{ minWidth: "8.5rem" }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

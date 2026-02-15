import {
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { $getSelection, $isRangeSelection } from "lexical";
import { $createHeadingNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { useEffect, useState } from "react";

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

interface ToolbarProps {
  editor: LexicalEditor | null;
  mode: EditorMode;
  onToggleMode: () => void;
  onInsertImage: () => void;
}

export function Toolbar({ editor, mode, onToggleMode, onInsertImage }: ToolbarProps) {
  const [currentFont, setCurrentFont] = useState(DEFAULT_FONT);
  const [currentFontSize, setCurrentFontSize] = useState(DEFAULT_FONT_SIZE);
  const [isFontSizeMixed, setIsFontSizeMixed] = useState(false);
  const [isCustomFontSize, setIsCustomFontSize] = useState(false);
  const [customFontSizePx, setCustomFontSizePx] = useState("");

  useEffect(() => {
    if (!editor) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const font =
            $getSelectionStyleValueForProperty(selection, "font-family", DEFAULT_FONT) || DEFAULT_FONT;
          setCurrentFont((prev) => (font === prev ? prev : font));

          const fontSize =
            $getSelectionStyleValueForProperty(selection, "font-size", DEFAULT_FONT_SIZE) || "";
          const hasSelection = !selection.isCollapsed();
          if (hasSelection && fontSize === "") {
            setIsFontSizeMixed(true);
            setCurrentFontSize(DEFAULT_FONT_SIZE);
          } else {
            setIsFontSizeMixed(false);
            const resolved = fontSize || DEFAULT_FONT_SIZE;
            setCurrentFontSize(resolved);
            const isPreset = FONT_SIZE_OPTIONS.some((o) => o.value === resolved && o.value !== "custom");
            setIsCustomFontSize(!isPreset && resolved !== DEFAULT_FONT_SIZE);
            if (!isPreset && resolved !== DEFAULT_FONT_SIZE) {
              const px = Number.parseInt(resolved, 10);
              if (!Number.isNaN(px)) setCustomFontSizePx(String(px));
            }
          }
        }
      });
    });
  }, [editor]);

  const run = (fn: (editor: LexicalEditor) => void) => {
    if (!editor) return;
    fn(editor);
  };

  const onFontChange = (value: string) => {
    run((e) =>
      e.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { "font-family": value });
        }
      })
    );
  };

  const onFontSizeChange = (value: string) => {
    if (value === "custom") {
      setIsCustomFontSize(true);
      return;
    }
    setIsCustomFontSize(false);
    run((e) =>
      e.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { "font-size": value === "default" ? null : value });
        }
      })
    );
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
    run((e) =>
      e.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { "font-size": value });
        }
      })
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/90 p-3 shadow-sm">
      <button className="toolbar-btn" onClick={() => run((e) => e.dispatchCommand(UNDO_COMMAND, undefined))}>
        Undo
      </button>
      <button className="toolbar-btn" onClick={() => run((e) => e.dispatchCommand(REDO_COMMAND, undefined))}>
        Redo
      </button>
      <span className="mx-1 h-6 w-px bg-zinc-300" />
      <button className="toolbar-btn" onClick={() => run((e) => e.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}>
        Bold
      </button>
      <button className="toolbar-btn" onClick={() => run((e) => e.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}>
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
      <button
        className="toolbar-btn"
        onClick={() =>
          run((e) =>
            e.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createHeadingNode("h1"));
              }
            }),
          )
        }
      >
        H1
      </button>
      <button
        className="toolbar-btn"
        onClick={() =>
          run((e) =>
            e.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createHeadingNode("h2"));
              }
            }),
          )
        }
      >
        H2
      </button>
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

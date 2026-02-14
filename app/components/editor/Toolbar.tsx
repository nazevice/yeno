import {
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";
import { $getSelection, $isRangeSelection } from "lexical";
import { $createHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";

import { TOGGLE_MODE_SHORTCUT } from "~/lib/doc/hotkeys";
import type { EditorMode } from "~/lib/doc/schema";

interface ToolbarProps {
  editor: LexicalEditor | null;
  mode: EditorMode;
  onToggleMode: () => void;
  onInsertImage: () => void;
}

export function Toolbar({ editor, mode, onToggleMode, onInsertImage }: ToolbarProps) {
  const run = (fn: (editor: LexicalEditor) => void) => {
    if (!editor) return;
    fn(editor);
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

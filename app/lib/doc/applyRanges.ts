import {
  $createRangeSelection,
  $getRoot,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
} from "lexical";
import { $patchStyleText } from "@lexical/selection";

import { findPointsForOffsets } from "./selectionFromOffsets";
import type { MetadataRange } from "./schema";

export function applyMetadataRanges(editor: LexicalEditor, ranges: MetadataRange[]): void {
  if (!ranges.length) return;

  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  for (const range of sorted) {
    const font = range.attrs?.font;
    const fontSize = range.attrs?.fontSize;
    const hasFont = typeof font === "string" && font !== "";
    const hasFontSize = typeof fontSize === "string" && fontSize !== "";
    if (!hasFont && !hasFontSize) continue;

    const stylePatch: Record<string, string | null> = {};
    if (hasFont) stylePatch["font-family"] = font as string;
    if (hasFontSize) stylePatch["font-size"] = fontSize as string;

    editor.update(
      () => {
        const root = $getRoot();
        const points = findPointsForOffsets(root, range.start, range.end);
        if (!points) return;

        const selection = $createRangeSelection();
        selection.anchor.set(points.anchor.key, points.anchor.offset, "text");
        selection.focus.set(points.focus.key, points.focus.offset, "text");
        $setSelection(selection);

        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, stylePatch);
        }

        $setSelection(null);
      },
      { tag: "apply-ranges" }
    );
  }
}

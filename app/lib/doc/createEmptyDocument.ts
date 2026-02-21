/**
 * Factory for empty document state.
 */

import type {
  DocumentTree,
  ParagraphNode,
  SectionNode,
} from "./schema";
import { generateId } from "./uuid";

export function createEmptyParagraph(start = 0): ParagraphNode {
  const id = generateId();
  return {
    id,
    type: "paragraph",
    textRange: { start, end: start },
    marks: [],
  };
}

export function createEmptySection(): SectionNode {
  const id = generateId();
  const paragraph = createEmptyParagraph(0);
  const section: SectionNode = {
    id,
    type: "section",
    children: [paragraph],
  };
  return section;
}

export function createEmptyDocument(): DocumentTree {
  const section = createEmptySection();
  return {
    version: 2,
    root: {
      children: [section],
    },
  };
}

import type { LexicalNode, PointType } from "lexical";
import { $createPoint, $isElementNode, $isTextNode } from "lexical";
import type { RootNode } from "lexical";

const IMAGE_NODE_TYPE = "yeno-image";

function isImageNode(node: LexicalNode): boolean {
  return node.getType() === IMAGE_NODE_TYPE;
}

export interface OffsetPoints {
  anchor: PointType;
  focus: PointType;
}

/**
 * Resolves character offsets (start, end) to Lexical points (nodeKey, offsetInNode).
 * Walks the tree in document order and returns anchor/focus for creating a RangeSelection.
 */
export function findPointsForOffsets(
  root: RootNode,
  startOffset: number,
  endOffset: number
): OffsetPoints | null {
  const totalLen = root.getTextContent().length;
  if (totalLen === 0) return null;
  const start = Math.max(0, Math.min(startOffset, totalLen));
  const end = Math.max(start, Math.min(endOffset, totalLen));

  let cursor = 0;
  let anchor: { key: string; offset: number } | null = null;
  let focus: { key: string; offset: number } | null = null;
  let lastTextNode: { key: string; len: number } | null = null;

  function walk(node: LexicalNode): boolean {
    if ($isTextNode(node)) {
      const len = node.getTextContent().length;
      const nodeStart = cursor;
      cursor += len;
      lastTextNode = { key: node.getKey(), len };

      if (anchor === null && nodeStart <= start && start <= cursor) {
        anchor = { key: node.getKey(), offset: start - nodeStart };
      }
      if (focus === null && nodeStart <= end && end <= cursor) {
        focus = { key: node.getKey(), offset: end - nodeStart };
      }
      if (anchor !== null && focus !== null) return true;
      return false;
    }
    if (isImageNode(node)) {
      const len = node.getTextContentSize();
      const nodeStart = cursor;
      cursor += len;

      if (anchor === null && nodeStart <= start && start <= cursor) {
        anchor = { key: node.getKey(), offset: Math.min(start - nodeStart, len) };
      }
      if (focus === null && nodeStart <= end && end <= cursor) {
        focus = { key: node.getKey(), offset: Math.min(end - nodeStart, len) };
      }
      if (anchor !== null && focus !== null) return true;
      return false;
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) {
        if (walk(child)) return true;
      }
    }
    return false;
  }

  for (const child of root.getChildren()) {
    if (walk(child)) break;
  }

  if (anchor === null && lastTextNode) {
    anchor = { key: lastTextNode.key, offset: lastTextNode.len };
  } else if (anchor === null) {
    return null;
  }
  if (focus === null) {
    focus = { key: anchor.key, offset: anchor.offset };
  }

  return {
    anchor: $createPoint(anchor.key, anchor.offset, "text"),
    focus: $createPoint(focus.key, focus.offset, "text"),
  };
}

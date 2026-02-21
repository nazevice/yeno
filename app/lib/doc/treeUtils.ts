/**
 * Utilities for walking the DocumentTree and mapping buffer positions.
 */

import type {
  BlockNode,
  DocumentTree,
  ParagraphNode,
  SectionNode,
  TableNode,
  TextRange,
} from "./schema";

export interface BufferSpan {
  start: number;
  end: number;
}

/** Result of resolving a buffer offset to a node. */
export interface ResolvedOffset {
  nodeId: string;
  nodeOffset: number;
  node: ParagraphNode | TableNode; // text-containing node
}

/** Iterate all blocks in document order with their buffer spans. */
export function* iterateBlocksInOrder(tree: DocumentTree): Generator<{ block: BlockNode; span: BufferSpan }> {
  for (const section of tree.root.children) {
    for (const block of section.children) {
      const span = getBlockSpan(block);
      if (span) yield { block, span };
    }
  }
}

/** Get the buffer span (start, end) for a block. */
export function getBlockSpan(block: BlockNode): BufferSpan | null {
  if (block.type === "paragraph" || block.type === "heading") {
    return { start: block.textRange.start, end: block.textRange.end };
  }
  if (block.type === "image") {
    return { start: block.bufferPosition, end: block.bufferPosition + 1 };
  }
  if (block.type === "table") {
    return { start: block.textRange.start, end: block.textRange.end };
  }
  if (block.type === "blockquote") {
    return getBlockquoteSpan(block);
  }
  if (block.type === "list") {
    return getListSpan(block);
  }
  return null;
}

function getBlockquoteSpan(block: Extract<BlockNode, { type: "blockquote" }>): BufferSpan | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const child of block.children) {
    const s = getBlockSpan(child as BlockNode);
    if (s) {
      if (start === null) start = s.start;
      end = s.end;
    }
  }
  return start != null && end != null ? { start, end } : null;
}

function getListSpan(block: Extract<BlockNode, { type: "list" }>): BufferSpan | null {
  let start: number | null = null;
  let end: number | null = null;
  for (const item of block.items) {
    const s = getBlockSpan(item.content as BlockNode);
    if (s) {
      if (start === null) start = s.start;
      end = s.end;
    }
  }
  return start != null && end != null ? { start, end } : null;
}

/** Resolve a buffer offset to (nodeId, nodeOffset). Returns the text-containing node. */
export function resolveBufferOffset(
  tree: DocumentTree,
  bufferOffset: number,
): ResolvedOffset | null {
  for (const section of tree.root.children) {
    for (const block of section.children) {
      const result = resolveOffsetInBlock(block, bufferOffset);
      if (result) return result;
    }
  }
  return null;
}

function resolveOffsetInBlock(
  block: BlockNode,
  bufferOffset: number,
): ResolvedOffset | null {
  if (block.type === "paragraph" || block.type === "heading") {
    const { start, end } = block.textRange;
    if (bufferOffset >= start && bufferOffset <= end) {
      return {
        nodeId: block.id,
        nodeOffset: bufferOffset - start,
        node: block,
      };
    }
    return null;
  }
  if (block.type === "image") {
    return null; // Can't put cursor inside image
  }
  if (block.type === "table") {
    const { start, end } = block.textRange;
    if (bufferOffset >= start && bufferOffset <= end) {
      return {
        nodeId: block.id,
        nodeOffset: bufferOffset - start,
        node: block,
      };
    }
    return null;
  }
  if (block.type === "blockquote") {
    for (const child of block.children) {
      const result = resolveOffsetInBlock(child as BlockNode, bufferOffset);
      if (result) return result;
    }
    return null;
  }
  if (block.type === "list") {
    for (const item of block.items) {
      const result = resolveOffsetInBlock(item.content as BlockNode, bufferOffset);
      if (result) return result;
    }
    return null;
  }
  return null;
}

/** Find section and block index containing the given block (by ID). */
export function findSectionAndBlockIndex(
  tree: DocumentTree,
  nodeId: string,
): { section: SectionNode; sectionIndex: number; blockIndex: number } | null {
  for (let si = 0; si < tree.root.children.length; si++) {
    const section = tree.root.children[si]!;
    for (let bi = 0; bi < section.children.length; bi++) {
      const block = section.children[bi]!;
      if (block.id === nodeId) return { section, sectionIndex: si, blockIndex: bi };
    }
  }
  return null;
}

/** Find a block node by ID. */
export function findBlockById(tree: DocumentTree, nodeId: string): BlockNode | null {
  for (const section of tree.root.children) {
    const found = findBlockInSection(section, nodeId);
    if (found) return found;
  }
  return null;
}

function findBlockInSection(section: SectionNode, nodeId: string): BlockNode | null {
  for (const block of section.children) {
    if (block.id === nodeId) return block;
    if (block.type === "blockquote") {
      for (const child of block.children) {
        if (child.id === nodeId) return child;
      }
    }
    if (block.type === "list") {
      for (const item of block.items) {
        if (item.id === nodeId) return item;
        if (item.content.id === nodeId) return item.content;
      }
    }
  }
  return null;
}

/** Get the buffer range for a node by ID. */
export function getNodeBufferRange(tree: DocumentTree, nodeId: string): TextRange | null {
  const block = findBlockById(tree, nodeId);
  if (!block) return null;
  if (block.type === "paragraph" || block.type === "heading" || block.type === "table") {
    return block.textRange;
  }
  return null;
}

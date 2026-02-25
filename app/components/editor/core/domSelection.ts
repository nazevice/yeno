import { toImageToken } from "~/lib/doc/imageToken";
import { getBlockTextContent, getPaginateableBlocks } from "./blockUtils";
import { TABLE_CELL_SEPARATOR } from "~/lib/domain/document/entities/Table";

export interface OffsetPoints {
  anchor: { node: Node; offset: number };
  focus: { node: Node; offset: number };
}

/** Get text content from root: walk blocks in order, emit block text + newlines. */
export function getTextContentFromDOM(root: HTMLElement): string {
  const blocks = getPaginateableBlocks(root);
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(getBlockTextFromElement(block));
  }
  return parts.join("\n");
}

function getTableFromBlock(block: HTMLElement): HTMLTableElement | null {
  if (block.tagName === "TABLE") return block as HTMLTableElement;
  return block.querySelector("table.editor-table");
}

function getBlockTextFromElement(block: HTMLElement): string {
  if (block.getAttribute?.("data-type") === "image") {
    const name = block.getAttribute("data-asset") ?? "";
    const alt = block.getAttribute("data-alt") ?? name;
    const w = block.getAttribute("data-width");
    const h = block.getAttribute("data-height");
    const width = w ? Number.parseInt(w, 10) : undefined;
    const height = h ? Number.parseInt(h, 10) : undefined;
    return toImageToken(name, alt, width, height);
  }
  const table = getTableFromBlock(block);
  if (table) return getTableTextContent(table);
  return getBlockTextContent(block);
}

function getTableTextContent(table: HTMLTableElement): string {
  const cells: string[] = [];
  for (const tr of table.rows) {
    for (const cell of tr.cells) {
      cells.push(getBlockTextContent(cell as HTMLElement));
    }
  }
  return cells.join(TABLE_CELL_SEPARATOR);
}


/** Simplified: count character offset from start of root. */
export function getOffsetFromRange(root: HTMLElement, range: Range): number {
  const preRange = document.createRange();
  preRange.setStart(root, 0);
  preRange.setEnd(range.startContainer, range.startOffset);
  return countTextLength(root, preRange);
}

function countTextLength(root: HTMLElement, range: Range): number {
  const endContainer = range.endContainer;
  const endOffset = range.endOffset;
  let count = 0;
  let done = false;
  const blocks = getPaginateableBlocks(root);

  function walkBlock(block: HTMLElement): void {
    if (done) return;
    if (block.getAttribute?.("data-type") === "image") {
      const name = block.getAttribute("data-asset") ?? "";
      const alt = block.getAttribute("data-alt") ?? name;
      const w = block.getAttribute("data-width");
      const h = block.getAttribute("data-height");
      const width = w ? Number.parseInt(w, 10) : undefined;
      const height = h ? Number.parseInt(h, 10) : undefined;
      const tokenLen = toImageToken(name, alt, width, height).length;
      if (block === endContainer) {
        count += endOffset > 0 ? tokenLen : 0;
        done = true;
        return;
      }
      count += tokenLen;
      return;
    }
    const table = getTableFromBlock(block);
    if (table) {
      let cellIndex = 0;
      const totalCells = Array.from(table.rows).reduce((sum, r) => sum + r.cells.length, 0);
      for (const row of table.rows) {
        for (const cell of row.cells) {
          walkInline(cell);
          if (done) return;
          if (cellIndex < totalCells - 1) count += 1;
          cellIndex += 1;
        }
      }
      return;
    }
    walkInline(block);
  }

  function walkInline(container: Node): void {
    if (done) return;
    if (container.nodeType === Node.TEXT_NODE) {
      const len = container.textContent?.length ?? 0;
      if (container === endContainer) {
        count += Math.min(endOffset, len);
        done = true;
        return;
      }
      count += len;
      return;
    }
    const el = container as HTMLElement;
    if (el.getAttribute?.("data-type") === "image") {
      const name = el.getAttribute("data-asset") ?? "";
      const alt = el.getAttribute("data-alt") ?? name;
      const w = el.getAttribute("data-width");
      const h = el.getAttribute("data-height");
      const width = w ? Number.parseInt(w, 10) : undefined;
      const height = h ? Number.parseInt(h, 10) : undefined;
      const tokenLen = toImageToken(name, alt, width, height).length;
      if (el === endContainer) {
        count += endOffset > 0 ? tokenLen : 0;
        done = true;
        return;
      }
      count += tokenLen;
      return;
    }
    if (el === endContainer && endOffset === 0) {
      done = true;
      return;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      if (el === endContainer && i >= endOffset) {
        done = true;
        return;
      }
      walkInline(el.childNodes[i]!);
      if (done) return;
    }
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    if (bi > 0) {
      count += 1;
      if (blocks[bi] === endContainer && endOffset === 0) {
        done = true;
        break;
      }
    }
    walkBlock(blocks[bi]!);
    if (done) break;
  }
  return count;
}

/** Resolve character offsets (start, end) to DOM Range. */
export function createRangeFromOffsets(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const minOffset = Math.min(startOffset, endOffset);
  const maxOffset = Math.max(startOffset, endOffset);
  const result = findNodesForOffsets(root, minOffset, maxOffset);
  if (!result) return null;

  const range = document.createRange();
  try {
    range.setStart(result.anchor.node, result.anchor.offset);
    range.setEnd(result.focus.node, result.focus.offset);
  } catch {
    return null;
  }
  return range;
}

export function applySelectionFromOffsets(
  root: HTMLElement,
  anchorOffset: number,
  focusOffset: number,
): boolean {
  const sel = window.getSelection();
  if (!sel) return false;

  const anchorResult = findNodesForOffsets(root, anchorOffset, anchorOffset);
  const focusResult = findNodesForOffsets(root, focusOffset, focusOffset);
  if (!anchorResult || !focusResult) return false;

  try {
    sel.setBaseAndExtent(
      anchorResult.anchor.node,
      anchorResult.anchor.offset,
      focusResult.anchor.node,
      focusResult.anchor.offset,
    );
    return true;
  } catch {
    return false;
  }
}

interface NodeOffset {
  node: Node;
  offset: number;
}

function findNodesForOffsets(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
): { anchor: NodeOffset; focus: NodeOffset } | null {
  let cursor = 0;
  let anchor: NodeOffset | null = null;
  let focus: NodeOffset | null = null;
  let lastNode: NodeOffset | null = null;
  const blocks = getPaginateableBlocks(root);

  function walkBlock(block: HTMLElement): boolean {
    if (block.getAttribute?.("data-type") === "image") {
      const name = block.getAttribute("data-asset") ?? "";
      const alt = block.getAttribute("data-alt") ?? name;
      const w = block.getAttribute("data-width");
      const h = block.getAttribute("data-height");
      const width = w ? Number.parseInt(w, 10) : undefined;
      const height = h ? Number.parseInt(h, 10) : undefined;
      const len = toImageToken(name, alt, width, height).length;
      const nodeStart = cursor;
      cursor += len;
      lastNode = { node: block, offset: 1 };
      if (anchor === null && nodeStart <= startOffset && startOffset <= cursor) {
        anchor = { node: block, offset: startOffset === nodeStart ? 0 : 1 };
      }
      if (focus === null && nodeStart <= endOffset && endOffset <= cursor) {
        focus = { node: block, offset: endOffset === nodeStart ? 0 : 1 };
      }
      return anchor !== null && focus !== null;
    }
    const table = getTableFromBlock(block);
    if (table) {
      let cellIndex = 0;
      const totalCells = Array.from(table.rows).reduce((sum, r) => sum + r.cells.length, 0);
      for (const row of table.rows) {
        for (const cell of row.cells) {
          if (walkInline(cell)) return true;
          if (cellIndex < totalCells - 1) cursor += 1;
          cellIndex += 1;
        }
      }
      return false;
    }
    return walkInline(block);
  }

  function walkInline(container: Node): boolean {
    const nodeStart = cursor;
    if (container.nodeType === Node.TEXT_NODE) {
      const textNode = container as Text;
      const len = textNode.textContent?.length ?? 0;
      cursor += len;
      lastNode = { node: textNode, offset: len };
      if (anchor === null && nodeStart <= startOffset && startOffset <= cursor) {
        anchor = { node: textNode, offset: startOffset - nodeStart };
      }
      if (focus === null && nodeStart <= endOffset && endOffset <= cursor) {
        focus = { node: textNode, offset: endOffset - nodeStart };
      }
      return anchor !== null && focus !== null;
    }
    const el = container as HTMLElement;
    if (el.tagName === "BR") {
      lastNode = { node: el, offset: 0 };
      if (anchor === null && cursor <= startOffset && startOffset <= cursor) {
        anchor = lastNode;
      }
      if (focus === null && cursor <= endOffset && endOffset <= cursor) {
        focus = { ...lastNode };
      }
      return anchor !== null && focus !== null;
    }
    if (el.getAttribute?.("data-type") === "image") {
      const name = el.getAttribute("data-asset") ?? "";
      const alt = el.getAttribute("data-alt") ?? name;
      const w = el.getAttribute("data-width");
      const h = el.getAttribute("data-height");
      const width = w ? Number.parseInt(w, 10) : undefined;
      const height = h ? Number.parseInt(h, 10) : undefined;
      const len = toImageToken(name, alt, width, height).length;
      cursor += len;
      lastNode = { node: el, offset: 1 };
      if (anchor === null && nodeStart <= startOffset && startOffset <= cursor) {
        anchor = { node: el, offset: startOffset === nodeStart ? 0 : 1 };
      }
      if (focus === null && nodeStart <= endOffset && endOffset <= cursor) {
        focus = { node: el, offset: endOffset === nodeStart ? 0 : 1 };
      }
      return anchor !== null && focus !== null;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      if (walkInline(el.childNodes[i]!)) return true;
    }
    if (nodeStart === cursor) {
      lastNode = { node: el, offset: 0 };
    }
    return false;
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    if (bi > 0) {
      if (anchor === null && cursor <= startOffset && startOffset < cursor + 1) {
        anchor = lastNode ?? { node: blocks[bi]!, offset: 0 };
      }
      if (focus === null && cursor <= endOffset && endOffset < cursor + 1) {
        focus = lastNode ?? { node: blocks[bi]!, offset: 0 };
      }
      cursor += 1;
      if (anchor !== null && focus !== null) break;
    }
    if (walkBlock(blocks[bi]!)) break;
  }

  if (anchor === null && lastNode) anchor = lastNode;
  if (focus === null) focus = anchor ? { ...anchor } : null;
  if (anchor === null || focus === null) return null;
  return { anchor, focus };
}

export function getSelectionOffsets(root: HTMLElement): { anchor: number; focus: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  if (!sel.anchorNode || !root.contains(sel.anchorNode)) return null;
  if (!sel.focusNode || !root.contains(sel.focusNode)) return null;
  const anchorRange = document.createRange();
  anchorRange.setStart(root, 0);
  anchorRange.setEnd(sel.anchorNode, sel.anchorOffset);
  const focusRange = document.createRange();
  focusRange.setStart(root, 0);
  focusRange.setEnd(sel.focusNode, sel.focusOffset);
  return {
    anchor: countTextLength(root, anchorRange),
    focus: countTextLength(root, focusRange),
  };
}

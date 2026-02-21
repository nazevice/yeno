/**
 * Editor Engine – model-first document editor.
 * Owns TextBuffer + DocumentTree, applies operations, manages selection and history.
 */

import { TextBuffer } from "./textBuffer";
import type {
  AssetRef,
  BlockNode,
  DocumentTree,
  EditorSelection,
  ImageNode,
  Operation,
  PieceTableContent,
  SectionNode,
} from "./schema";
import { OBJECT_REPLACEMENT_CHAR } from "./schema";
import { createEmptyDocument, createEmptyParagraph } from "./createEmptyDocument";
import { generateId } from "./uuid";
import { resolveBufferOffset, findBlockById, findSectionAndBlockIndex, getBlockSpan } from "./treeUtils";

export interface HistoryEntry {
  tree: DocumentTree;
  content: PieceTableContent;
  selection: EditorSelection | null;
}

const MAX_HISTORY = 50;

export class EditorEngine {
  readonly textBuffer: TextBuffer;
  private _tree: DocumentTree;
  private _selection: EditorSelection | null = null;
  private _historyPast: HistoryEntry[] = [];
  private _historyFuture: HistoryEntry[] = [];
  private _listeners = new Set<() => void>();

  constructor(tree?: DocumentTree, content?: PieceTableContent) {
    this._tree = tree ?? createEmptyDocument();
    this.textBuffer = new TextBuffer(
      content ?? { baseText: "", chunks: [] },
    );
  }

  get tree(): DocumentTree {
    return this._tree;
  }

  get selection(): EditorSelection | null {
    return this._selection;
  }

  setSelection(selection: EditorSelection | null): void {
    this._selection = selection;
    this._notify();
  }

  /** Get selection as buffer-absolute offsets (simplified for input handling). */
  getSelectionOffsets(): { anchor: number; focus: number } | null {
    if (!this._selection) return null;
    const anchor = this._selectionToBufferOffset(this._selection.anchor);
    const focus = this._selectionToBufferOffset(this._selection.focus);
    if (anchor == null || focus == null) return null;
    return { anchor, focus };
  }

  private _selectionToBufferOffset(point: { nodeId: string; offset: number }): number | null {
    const block = findBlockById(this._tree, point.nodeId);
    if (!block) return null;
    if (block.type === "paragraph" || block.type === "heading" || block.type === "table") {
      return block.textRange.start + point.offset;
    }
    return null;
  }

  /** Set selection from buffer-absolute offsets. */
  setSelectionFromOffsets(anchor: number, focus: number): void {
    const anchorResolved = resolveBufferOffset(this._tree, anchor);
    const focusResolved = resolveBufferOffset(this._tree, focus);
    if (!anchorResolved || !focusResolved) return;
    this._selection = {
      anchor: { nodeId: anchorResolved.nodeId, offset: anchorResolved.nodeOffset },
      focus: { nodeId: focusResolved.nodeId, offset: focusResolved.nodeOffset },
    };
  }

  /** Apply an operation to the model. */
  apply(op: Operation): boolean {
    switch (op.type) {
      case "insert":
        return this._applyInsert(op.nodeId, op.offset, op.text);
      case "delete":
        return this._applyDelete(op.nodeId, op.offset, op.len);
      case "format":
        return this._applyFormat(op.nodeId, op.start, op.end, op.attrs);
      case "insertBlock":
        return this._applyInsertBlock(op.afterNodeId, op.block);
      case "deleteBlock":
        return this._applyDeleteBlock(op.nodeId);
      default:
        return false;
    }
  }

  private _applyInsert(nodeId: string, offset: number, text: string): boolean {
    const block = findBlockById(this._tree, nodeId);
    if (!block || (block.type !== "paragraph" && block.type !== "heading" && block.type !== "table")) {
      return false;
    }
    const bufPos = block.textRange.start + offset;
    this.textBuffer.insert(bufPos, text);
    this._shiftRangesAfter(bufPos, text.length);
    block.textRange.end += text.length;
    this._notify();
    return true;
  }

  private _applyDelete(nodeId: string, offset: number, len: number): boolean {
    const block = findBlockById(this._tree, nodeId);
    if (!block || (block.type !== "paragraph" && block.type !== "heading" && block.type !== "table")) {
      return false;
    }
    const bufPos = block.textRange.start + offset;
    const actualLen = Math.min(len, block.textRange.end - block.textRange.start - offset);
    if (actualLen <= 0) return false;
    this.textBuffer.delete(bufPos, actualLen);
    this._shiftRangesAfter(bufPos, -actualLen);
    block.textRange.end -= actualLen;
    this._notify();
    return true;
  }

  private _applyFormat(
    _nodeId: string,
    _start: number,
    _end: number,
    _attrs: Record<string, unknown>,
  ): boolean {
    // TODO: add/merge InlineMark into the node's marks array
    return false;
  }

  private _applyInsertBlock(_afterNodeId: string | null, _block: BlockNode): boolean {
    // TODO: insert block, update buffer with sentinel or text range
    return false;
  }

  private _applyDeleteBlock(_nodeId: string): boolean {
    // TODO: remove block, update buffer
    return false;
  }

  /** Shift all node ranges that start at or after `pos` by `delta`. */
  private _shiftRangesAfter(pos: number, delta: number): void {
    if (delta === 0) return;
    for (const section of this._tree.root.children) {
      for (const block of section.children) {
        this._shiftBlock(block, pos, delta);
      }
    }
  }

  private _shiftBlock(block: BlockNode, pos: number, delta: number): void {
    if (block.type === "paragraph" || block.type === "heading") {
      if (block.textRange.start >= pos) {
        block.textRange.start += delta;
        block.textRange.end += delta;
      } else if (block.textRange.end > pos) {
        block.textRange.end += delta;
      }
    } else if (block.type === "image") {
      if (block.bufferPosition >= pos) {
        block.bufferPosition += delta;
      }
    } else if (block.type === "table") {
      if (block.textRange.start >= pos) {
        block.textRange.start += delta;
        block.textRange.end += delta;
      } else if (block.textRange.end > pos) {
        block.textRange.end += delta;
      }
    } else if (block.type === "blockquote") {
      for (const child of block.children) {
        this._shiftBlock(child as BlockNode, pos, delta);
      }
    } else if (block.type === "list") {
      for (const item of block.items) {
        this._shiftBlock(item.content as BlockNode, pos, delta);
      }
    }
  }

  // ─── History ──────────────────────────────────────────────────────────────

  /** Mark start of an undo group; call before a batch of edits. */
  pushHistory(): void {
    this._historyFuture = [];
    const entry: HistoryEntry = {
      tree: JSON.parse(JSON.stringify(this._tree)),
      content: this.textBuffer.toContent(),
      selection: this._selection ? { ...this._selection } : null,
    };
    if (this._historyPast.length > 0) {
      const last = this._historyPast[this._historyPast.length - 1]!;
      if (JSON.stringify(last.content) === JSON.stringify(entry.content)) return;
    }
    this._historyPast.push(entry);
    if (this._historyPast.length > MAX_HISTORY) this._historyPast.shift();
  }

  undo(): boolean {
    if (this._historyPast.length === 0) return false;
    const current: HistoryEntry = {
      tree: JSON.parse(JSON.stringify(this._tree)),
      content: this.textBuffer.toContent(),
      selection: this._selection ? { ...this._selection } : null,
    };
    this._historyFuture.unshift(current);
    const entry = this._historyPast.pop()!;
    this._restore(entry);
    return true;
  }

  redo(): boolean {
    if (this._historyFuture.length === 0) return false;
    const current: HistoryEntry = {
      tree: JSON.parse(JSON.stringify(this._tree)),
      content: this.textBuffer.toContent(),
      selection: this._selection ? { ...this._selection } : null,
    };
    this._historyPast.push(current);
    const entry = this._historyFuture.shift()!;
    this._restore(entry);
    return true;
  }

  private _restore(entry: HistoryEntry): void {
    this._tree = entry.tree;
    this.textBuffer.replaceContent(entry.content);
    this._selection = entry.selection;
    this._notify();
  }

  get canUndo(): boolean {
    return this._historyPast.length > 0;
  }

  get canRedo(): boolean {
    return this._historyFuture.length > 0;
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    for (const fn of this._listeners) fn();
  }

  /**
   * Insert an image block after the block containing the current selection.
   * Inserts U+FFFC sentinel into the buffer per the spec.
   */
  insertImage(assetRef: Pick<AssetRef, "name" | "alt"> & { size?: [number, number] }): boolean {
    const offs = this.getSelectionOffsets();
    if (!offs) return false;
    const resolved = resolveBufferOffset(this._tree, offs.anchor);
    if (!resolved) return false;
    const location = findSectionAndBlockIndex(this._tree, resolved.nodeId);
    if (!location) return false;
    const { section, blockIndex } = location;
    const block = section.children[blockIndex]!;
    const span = getBlockSpan(block);
    if (!span) return false;
    const insertPos = span.end;
    this.pushHistory();
    this.textBuffer.insert(insertPos, OBJECT_REPLACEMENT_CHAR);
    this._shiftRangesAfter(insertPos, 1);
    const imageNode: ImageNode = {
      id: generateId(),
      type: "image",
      bufferPosition: insertPos,
      assetRef: {
        name: assetRef.name,
        targetPos: insertPos,
        alt: assetRef.alt,
        size: assetRef.size ?? [0, 0],
        bytes: [],
      },
      alt: assetRef.alt,
      size: assetRef.size ?? [0, 0],
    };
    section.children.splice(blockIndex + 1, 0, imageNode);
    this._notify();
    return true;
  }

  /** Replace the entire document with plain text (e.g. for load test / restore). */
  loadPlainText(text: string): void {
    const paragraph = createEmptyParagraph(0);
    paragraph.textRange = { start: 0, end: text.length };
    const sectionId = require("./uuid").generateId();
    const section: import("./schema").SectionNode = {
      id: sectionId,
      type: "section",
      children: [paragraph],
    };
    this._tree = {
      version: 2,
      root: { children: [section] },
    };
    this.textBuffer.replaceContent({ baseText: text, chunks: [] });
    this._notify();
  }
}

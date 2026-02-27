import type { BlockId, DocumentId, SectionId } from "../domain/shared/NodeId";
import { Document } from "../domain/document/Document";
import type { DocumentRepository } from "../domain/document/DocumentRepository";
import type { DocumentSnapshot } from "../domain/document/DocumentSnapshot";
import type { Block } from "../domain/document/entities";
import { TextAttributes } from "../domain/document/value-objects/TextAttributes";
import type { TextAlign } from "../domain/document/value-objects/TextAlign";
import type { SectionLayout } from "../domain/document/value-objects/SectionLayout";
import type { AssetRef } from "../domain/document/entities/Image";
import { isTable, isTextBlock, isImage, isParagraph, isHeading } from "../domain/document/entities";
import { HistoryManager } from "./HistoryManager";
import { SelectionManager, type Selection } from "./SelectionManager";
import { ActiveMarksManager } from "./ActiveMarksManager";
import { ClipboardPayload, type ClipboardBlock, serializeToHtml } from "../domain/clipboard";

export class EditorService {
  private document: Document | null = null;
  private repository: DocumentRepository | null = null;
  private historyManager: HistoryManager;
  private selectionManager: SelectionManager;
  private activeMarksManager: ActiveMarksManager;
  private listeners: Set<() => void> = new Set();
  private _isDirty: boolean = false;

  constructor(repository?: DocumentRepository) {
    this.repository = repository ?? null;
    this.historyManager = new HistoryManager();
    this.selectionManager = new SelectionManager();
    this.activeMarksManager = new ActiveMarksManager();
  }

  getDocument(): Document | null {
    return this.document;
  }

  get selection(): Selection | null {
    return this.selectionManager.selection;
  }

  get activeMarks(): TextAttributes | null {
    return this.activeMarksManager.marks;
  }

  get canUndo(): boolean {
    return this.historyManager.canUndo;
  }

  get canRedo(): boolean {
    return this.historyManager.canRedo;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  newDocument(): void {
    this.document = Document.createEmpty();
    this.historyManager.clear();
    this.selectionManager.setSelection(null);
    this.activeMarksManager.clear();
    this._isDirty = false;
    this._notify();
  }

  async openDocument(id: DocumentId): Promise<void> {
    if (!this.repository) {
      throw new Error("No repository configured");
    }
    
    const doc = await this.repository.findById(id);
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }
    
    this.document = doc;
    this.historyManager.clear();
    this.selectionManager.setSelection(null);
    this.activeMarksManager.clear();
    this._isDirty = false;
    this._notify();
  }

  async saveDocument(): Promise<void> {
    if (!this.document) {
      throw new Error("No document to save");
    }
    if (!this.repository) {
      throw new Error("No repository configured");
    }
    
    await this.repository.save(this.document);
    this._isDirty = false;
    this._notify();
  }

  closeDocument(): void {
    this.document = null;
    this.historyManager.clear();
    this.selectionManager.setSelection(null);
    this.activeMarksManager.clear();
    this._isDirty = false;
    this._notify();
  }

  setRepository(repository: DocumentRepository): void {
    this.repository = repository;
  }

  insertText(text: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    const block = this.document.getBlock(sel.anchor.blockId);
    if (!block) return;
    
    if (this.selectionManager.isCollapsed) {
      this.document.insertText(sel.anchor.blockId, sel.anchor.offset, text);
      
      const newOffset = sel.anchor.offset + text.length;
      this.selectionManager.setSelection({
        anchor: { blockId: sel.anchor.blockId, offset: newOffset },
        focus: { blockId: sel.anchor.blockId, offset: newOffset },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  deleteText(length: number, direction: "forward" | "backward"): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const offset = direction === "backward" ? sel.anchor.offset - length : sel.anchor.offset;
      if (offset < 0) return;
      
      this.document.deleteText(sel.anchor.blockId, offset, length);
      this.selectionManager.setSelection({
        anchor: { blockId: sel.anchor.blockId, offset },
        focus: { blockId: sel.anchor.blockId, offset },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  backspace(): void {
    this.deleteText(1, "backward");
  }

  delete(): void {
    this.deleteText(1, "forward");
  }

  splitBlock(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    const event = this.document.splitBlock(sel.anchor.blockId, sel.anchor.offset);
    if (event) {
      this.selectionManager.setSelection({
        anchor: { blockId: event.newBlockId, offset: 0 },
        focus: { blockId: event.newBlockId, offset: 0 },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  mergeBlocks(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel || !this.selectionManager.isCollapsed) return;
    
    const block = this.document.getBlock(sel.anchor.blockId);
    if (!block) return;
    
    const blockRange = this.document.getBlockRange(sel.anchor.blockId);
    if (!blockRange || sel.anchor.offset !== 0) return;
    
    const resolved = this.document.findBlockAtPosition(blockRange.start - 1);
    if (!resolved) return;
    
    this._pushHistory();
    
    const event = this.document.mergeBlocks(resolved.block.id, sel.anchor.blockId);
    if (event) {
      this.selectionManager.setSelection({
        anchor: { blockId: event.survivingBlockId, offset: resolved.localOffset + 1 },
        focus: { blockId: event.survivingBlockId, offset: resolved.localOffset + 1 },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  formatText(attrs: TextAttributes): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const currentMarks = this.activeMarksManager.marks ?? TextAttributes.empty;
      this.activeMarksManager.setMarks(currentMarks.merge(attrs));
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        this.document.formatText(start.blockId, start.offset, end.offset, attrs);
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  setBlockType(type: "paragraph" | "heading", level?: 1 | 2 | 3): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    this.document.changeBlockType(sel.anchor.blockId, type, level);
    
    this._isDirty = true;
    this._notify();
  }

  setTextAlign(align: TextAlign): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    this.document.setTextAlign(sel.anchor.blockId, align);
    
    this._isDirty = true;
    this._notify();
  }

  insertBlock(sectionId: SectionId, index: number, block: Block): void {
    if (!this.document) return;
    
    this._pushHistory();
    this.document.insertBlock(sectionId, index, block);
    
    this._isDirty = true;
    this._notify();
  }

  deleteBlock(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    this.document.deleteBlock(sel.anchor.blockId);
    
    this._isDirty = true;
    this._notify();
  }

  moveBlock(blockId: BlockId, newSectionId: SectionId, newIndex: number): void {
    if (!this.document) return;
    
    this._pushHistory();
    this.document.moveBlock(blockId, newSectionId, newIndex);
    
    this._isDirty = true;
    this._notify();
  }

  setSectionLayout(sectionId: SectionId, layout: SectionLayout): void {
    if (!this.document) return;
    
    this._pushHistory();
    this.document.setSectionLayout(sectionId, layout);
    
    this._isDirty = true;
    this._notify();
  }

  undo(): void {
    if (!this.document) return;
    
    const currentSnapshot = this.document.toSnapshot();
    const currentSelection = this.selectionManager.selection;
    
    const entry = this.historyManager.undo({
      snapshot: currentSnapshot,
      selection: currentSelection,
    });
    if (!entry) return;
    
    this.document = Document.reconstitute(entry.snapshot);
    this.selectionManager.setSelection(entry.selection);
    
    this._isDirty = true;
    this._notify();
  }

  redo(): void {
    if (!this.document) return;
    
    const currentSnapshot = this.document.toSnapshot();
    const currentSelection = this.selectionManager.selection;
    
    const entry = this.historyManager.redo({
      snapshot: currentSnapshot,
      selection: currentSelection,
    });
    if (!entry) return;
    
    this.document = Document.reconstitute(entry.snapshot);
    this.selectionManager.setSelection(entry.selection);
    
    this._isDirty = true;
    this._notify();
  }

  setSelection(selection: Selection): void {
    const prev = this.selectionManager.selection;
    if (prev && selection && prev.anchor.blockId === selection.anchor.blockId &&
        prev.anchor.offset === selection.anchor.offset && prev.focus.blockId === selection.focus.blockId &&
        prev.focus.offset === selection.focus.offset) {
      return;
    }
    if (!prev && !selection) return;
    this.selectionManager.setSelection(selection);
    this._notify();
  }

  setSelectionFromOffsets(anchor: number, focus: number): void {
    if (!this.document) return;

    const anchorResolved = this.document.findBlockAtPosition(anchor);
    const focusResolved = this.document.findBlockAtPosition(focus);

    if (!anchorResolved || !focusResolved) return;

    const newSel = {
      anchor: { blockId: anchorResolved.block.id, offset: anchorResolved.localOffset },
      focus: { blockId: focusResolved.block.id, offset: focusResolved.localOffset },
    };
    const prev = this.selectionManager.selection;
    const selectionChanged = !prev || 
      prev.anchor.blockId !== newSel.anchor.blockId ||
      prev.anchor.offset !== newSel.anchor.offset || 
      prev.focus.blockId !== newSel.focus.blockId ||
      prev.focus.offset !== newSel.focus.offset;
    
    if (!selectionChanged) return;
    
    this.selectionManager.setSelection(newSel);
    
    let marksChanged = false;
    if (anchor === focus) {
      const newMarks = this.document.getMarksAtOffset(newSel.anchor.blockId, newSel.anchor.offset);
      const prevMarks = this.activeMarksManager.marks;
      if (!prevMarks || !prevMarks.equals(newMarks)) {
        this.activeMarksManager.setMarks(newMarks);
        marksChanged = true;
      }
    }
    
    this._notify();
  }

  setActiveMarks(marks: TextAttributes | null): void {
    this.activeMarksManager.setMarks(marks);
    this._notify();
  }

  insertImageBlock(assetRef: AssetRef, alt: string, size: readonly [number, number]): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    this.document.insertImageBlock(sel.anchor.blockId, assetRef, alt, size);
    
    this._isDirty = true;
    this._notify();
  }

  updateImageSize(blockId: BlockId, width: number, height: number): void {
    if (!this.document) return;
    
    this._pushHistory();
    
    this.document.setImageSize(blockId, [width, height]);
    
    this._isDirty = true;
    this._notify();
  }

  insertTableBlock(rows: number, cols: number): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    const event = this.document.insertTableBlock(sel.anchor.blockId, rows, cols);
    
    if (event && isTable(event.block)) {
      const firstCell = event.block.rows[0]?.cells[0];
      const firstPara = firstCell?.children[0];
      const blockId = firstPara?.id ?? event.block.id;
      this.selectionManager.setSelection({
        anchor: { blockId, offset: 0 },
        focus: { blockId, offset: 0 },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  insertTocBlock(title?: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    const event = this.document.insertTocBlock(sel.anchor.blockId, title);
    
    if (event) {
      this.selectionManager.setSelection({
        anchor: { blockId: event.block.id, offset: 0 },
        focus: { blockId: event.block.id, offset: 0 },
      });
    }
    
    this._isDirty = true;
    this._notify();
  }

  toggleBold(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    if (this.selectionManager.isCollapsed) {
      this.activeMarksManager.toggleBold();
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        const hasBold = this.document.rangeHasAttribute(
          start.blockId,
          start.offset,
          end.offset,
          "bold"
        );
        this.formatText(TextAttributes.from({ bold: !hasBold }));
      }
    }
    
    this._notify();
  }

  toggleItalic(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    if (this.selectionManager.isCollapsed) {
      this.activeMarksManager.toggleItalic();
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        const hasItalic = this.document.rangeHasAttribute(
          start.blockId,
          start.offset,
          end.offset,
          "italic"
        );
        this.formatText(TextAttributes.from({ italic: !hasItalic }));
      }
    }
    
    this._notify();
  }

  toggleUnderline(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    if (this.selectionManager.isCollapsed) {
      this.activeMarksManager.toggleUnderline();
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        const hasUnderline = this.document.rangeHasAttribute(
          start.blockId,
          start.offset,
          end.offset,
          "underline"
        );
        this.formatText(TextAttributes.from({ underline: !hasUnderline }));
      }
    }
    
    this._notify();
  }

  setLink(href: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const currentMarks = this.activeMarksManager.marks ?? TextAttributes.empty;
      this.activeMarksManager.setMarks(currentMarks.withHref(href));
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        this.formatText(TextAttributes.from({ href }));
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  removeLink(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const currentMarks = this.activeMarksManager.marks ?? TextAttributes.empty;
      this.activeMarksManager.setMarks(currentMarks.removeLink());
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        this.formatText(TextAttributes.from({ href: undefined }));
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  getActiveLink(): string | null {
    const marks = this.activeMarks;
    return marks?.href ?? null;
  }

  setColor(color: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const currentMarks = this.activeMarksManager.marks ?? TextAttributes.empty;
      this.activeMarksManager.setMarks(currentMarks.withColor(color));
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        this.formatText(TextAttributes.from({ color }));
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  removeColor(): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (this.selectionManager.isCollapsed) {
      const currentMarks = this.activeMarksManager.marks ?? TextAttributes.empty;
      this.activeMarksManager.setMarks(currentMarks.removeColor());
    } else {
      const start = this.selectionManager.getStartPoint()!;
      const end = this.selectionManager.getEndPoint()!;
      
      if (start.blockId === end.blockId) {
        this.formatText(TextAttributes.from({ color: undefined }));
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  getActiveColor(): string | null {
    const marks = this.activeMarks;
    return marks?.color ?? null;
  }

  getSelectionGlobalRange(): { start: number; end: number } | null {
    if (!this.document) return null;
    
    const sel = this.selectionManager.selection;
    if (!sel) return null;
    
    const anchorRange = this.document.getBlockRange(sel.anchor.blockId);
    const focusRange = this.document.getBlockRange(sel.focus.blockId);
    
    if (!anchorRange || !focusRange) return null;
    
    const anchorGlobal = anchorRange.start + sel.anchor.offset;
    const focusGlobal = focusRange.start + sel.focus.offset;
    
    return {
      start: Math.min(anchorGlobal, focusGlobal),
      end: Math.max(anchorGlobal, focusGlobal),
    };
  }

  getClipboardData(): { json: ClipboardPayload; html: string; text: string } | null {
    if (!this.document) return null;
    
    const sel = this.selectionManager.selection;
    if (!sel) return null;
    
    const range = this.getSelectionGlobalRange();
    if (!range) return null;
    
    if (range.start === range.end) return null;
    
    const blocks = this.document.getBlocksInRange(range.start, range.end);
    const clipboardBlocks: ClipboardBlock[] = [];
    
    for (const block of blocks) {
      const clipboardBlock = this.blockToClipboardBlock(block, range.start, range.end);
      if (clipboardBlock) {
        clipboardBlocks.push(clipboardBlock);
      }
    }
    
    const payload = ClipboardPayload.create(clipboardBlocks);
    
    return {
      json: payload,
      html: serializeToHtml(payload),
      text: ClipboardPayload.getTextContent(payload),
    };
  }

  private blockToClipboardBlock(
    block: Block,
    rangeStart: number,
    rangeEnd: number
  ): ClipboardBlock | null {
    if (isTextBlock(block)) {
      const blockStart = block.textRange.start;
      const blockEnd = block.textRange.end;
      
      const intersectStart = Math.max(blockStart, rangeStart);
      const intersectEnd = Math.min(blockEnd, rangeEnd);
      
      if (intersectStart >= intersectEnd) return null;
      
      const localStart = intersectStart - blockStart;
      const localEnd = intersectEnd - blockStart;
      
      const text = this.document!.getTextInRange(intersectStart, intersectEnd);
      
      const clippedMarks = block.marks
        .map((mark) => {
          const markStart = Math.max(mark.start, localStart);
          const markEnd = Math.min(mark.end, localEnd);
          if (markStart >= markEnd) return null;
          return {
            start: markStart - localStart,
            end: markEnd - localStart,
            attrs: mark.attrs.toJSON(),
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      
      const result: ClipboardBlock = {
        type: block.type,
        text,
        marks: clippedMarks,
      };
      
      if (isHeading(block)) {
        result.level = block.level;
      }
      if (block.textAlign) {
        result.textAlign = block.textAlign;
      }
      
      return result;
    }
    
    if (isImage(block)) {
      return {
        type: "image",
        assetName: block.assetRef.name,
        alt: block.alt,
        size: block.size,
        bytes: block.assetRef.bytes,
      };
    }
    
    return null;
  }

  deleteSelection(): void {
    if (!this.document) return;
    
    const range = this.getSelectionGlobalRange();
    if (!range || range.start === range.end) return;
    
    this._pushHistory();
    
    const blocks = this.document.getBlocksInRange(range.start, range.end);
    
    if (blocks.length === 1) {
      const block = blocks[0];
      if (block && isTextBlock(block)) {
        const blockStart = block.textRange.start;
        const localStart = range.start - blockStart;
        const localEnd = range.end - blockStart;
        this.document.deleteText(block.id, localStart, localEnd - localStart);
        
        this.selectionManager.setSelection({
          anchor: { blockId: block.id, offset: localStart },
          focus: { blockId: block.id, offset: localStart },
        });
      }
    } else {
      this.document.deleteRange(range.start, range.end);
      
      const resolved = this.document.findBlockAtPosition(range.start);
      if (resolved && isTextBlock(resolved.block)) {
        this.selectionManager.setSelection({
          anchor: { blockId: resolved.block.id, offset: resolved.localOffset },
          focus: { blockId: resolved.block.id, offset: resolved.localOffset },
        });
      }
    }
    
    this._isDirty = true;
    this._notify();
  }

  insertFromClipboard(payload: ClipboardPayload): void {
    if (!this.document) return;
    if (ClipboardPayload.isEmpty(payload)) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (!this.selectionManager.isCollapsed) {
      this.deleteSelection();
    }
    
    const currentSel = this.selectionManager.selection;
    if (!currentSel) return;
    
    let insertBlockId = currentSel.anchor.blockId;
    let insertOffset = currentSel.anchor.offset;
    
    for (const block of payload.blocks) {
      if (block.type === "image") {
        const assetRef: AssetRef = {
          name: block.assetName,
          targetPos: 0,
          alt: block.alt,
          size: block.size,
          bytes: block.bytes,
        };
        this.document.insertImageBlock(insertBlockId, assetRef, block.alt, block.size);
      } else {
        const textBlock = this.document.getBlock(insertBlockId);
        if (textBlock && isTextBlock(textBlock) && block.text.length > 0) {
          this.document.insertText(insertBlockId, insertOffset, block.text);
          
          if (block.marks.length > 0) {
            for (const mark of block.marks) {
              const attrs = TextAttributes.from(mark.attrs ?? {});
              this.document.formatText(insertBlockId, insertOffset + mark.start, insertOffset + mark.end, attrs);
            }
          }
          
          insertOffset += block.text.length;
        }
      }
    }
    
    this.selectionManager.setSelection({
      anchor: { blockId: insertBlockId, offset: insertOffset },
      focus: { blockId: insertBlockId, offset: insertOffset },
    });
    
    this._isDirty = true;
    this._notify();
  }

  insertPlainText(text: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    this._pushHistory();
    
    if (!this.selectionManager.isCollapsed) {
      this.deleteSelection();
    }
    
    const currentSel = this.selectionManager.selection;
    if (!currentSel) return;
    
    let insertBlockId = currentSel.anchor.blockId;
    let insertOffset = currentSel.anchor.offset;
    
    const lines = text.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (i > 0) {
        this.document.splitBlock(insertBlockId, insertOffset);
        const blockRange = this.document.getBlockRange(insertBlockId);
        if (blockRange) {
          const resolved = this.document.findBlockAtPosition(blockRange.start + insertOffset + 1);
          if (resolved) {
            insertBlockId = resolved.block.id;
            insertOffset = 0;
          }
        }
      }
      
      if (line && line.length > 0) {
        this.document.insertText(insertBlockId, insertOffset, line);
        insertOffset += line.length;
      }
    }
    
    this.selectionManager.setSelection({
      anchor: { blockId: insertBlockId, offset: insertOffset },
      focus: { blockId: insertBlockId, offset: insertOffset },
    });
    
    this._isDirty = true;
    this._notify();
  }

  insertImageFromDataUrl(dataUrl: string, filename: string): void {
    if (!this.document) return;
    
    const sel = this.selectionManager.selection;
    if (!sel) return;
    
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return;
    
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    let bytes: number[];
    try {
      const binary = atob(match[2]!);
      bytes = Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i));
    } catch {
      return;
    }
    
    const assetName = `pasted-${crypto.randomUUID()}.${ext}`;
    
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 200;
      const height = img.naturalHeight || 200;
      
      const assetRef: AssetRef = {
        name: assetName,
        targetPos: 0,
        alt: filename || "Pasted image",
        size: [width, height],
        bytes,
      };
      
      this.insertImageBlock(assetRef, assetRef.alt, [width, height]);
    };
    img.src = dataUrl;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private _pushHistory(): void {
    if (!this.document) return;
    
    const snapshot = this.document.toSnapshot();
    const selection = this.selectionManager.selection;
    
    this.historyManager.push({
      snapshot,
      selection: selection ? { ...selection } : null,
    });
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

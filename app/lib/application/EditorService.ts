import type { BlockId, DocumentId, SectionId } from "../domain/shared/NodeId";
import { Document } from "../domain/document/Document";
import type { DocumentRepository } from "../domain/document/DocumentRepository";
import type { Block } from "../domain/document/entities";
import { TextAttributes } from "../domain/document/value-objects/TextAttributes";
import type { TextAlign } from "../domain/document/value-objects/TextAlign";
import type { SectionLayout } from "../domain/document/value-objects/SectionLayout";
import type { AssetRef } from "../domain/document/entities/Image";
import type { DocumentEvents } from "../domain/document/events";
import { HistoryManager } from "./HistoryManager";
import { SelectionManager, type Selection } from "./SelectionManager";
import { ActiveMarksManager } from "./ActiveMarksManager";

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
    const entry = this.historyManager.undo();
    if (!entry || !this.document) return;
    
    this._applyInverseEvent(entry.inverseEvent);
    this.selectionManager.setSelection(entry.selection);
    
    this._isDirty = true;
    this._notify();
  }

  redo(): void {
    const entry = this.historyManager.redo();
    if (!entry || !this.document) return;
    
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
    if (prev && prev.anchor.blockId === newSel.anchor.blockId &&
        prev.anchor.offset === newSel.anchor.offset && prev.focus.blockId === newSel.focus.blockId &&
        prev.focus.offset === newSel.focus.offset) {
      return;
    }
    this.selectionManager.setSelection(newSel);
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
    
    this.document.insertTableBlock(sel.anchor.blockId, rows, cols);
    
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private _pushHistory(): void {
    const sel = this.selectionManager.selection;
    const lastEvent = this.document?.pullEvents()[0];
    
    if (lastEvent) {
      const inverseEvent = this._createInverseEvent(lastEvent);
      if (inverseEvent) {
        this.historyManager.push({
          inverseEvent,
          selection: sel ? { ...sel } : null,
        });
      }
    }
  }

  private _createInverseEvent(event: DocumentEvents): DocumentEvents | null {
    return null;
  }

  private _applyInverseEvent(event: DocumentEvents): void {
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

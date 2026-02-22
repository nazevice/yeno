import { DocumentId, BlockId, SectionId } from "../shared/NodeId";
import { BufferRange } from "./value-objects/BufferRange";
import { TextAttributes } from "./value-objects/TextAttributes";
import { FormattingMark, mergeFormattingMarks, shiftMarksAfter, rangeHasAttr } from "./value-objects/FormattingMark";
import type { SectionLayout } from "./value-objects/SectionLayout";
import type { TextAlign } from "./value-objects/TextAlign";
import { TextBuffer } from "./buffer/TextBuffer";
import type { TextBufferContent } from "./buffer/TextBufferTypes";
import { Section } from "./entities/Section";
import type { Paragraph } from "./entities/Paragraph";
import type { Heading } from "./entities/Heading";
import type { Block, TextBlock } from "./entities";
import { isTextBlock, isParagraph, isHeading, isImage, isTable, isList, isBlockquote } from "./entities";
import { DocumentEvents } from "./events";
import type { TextInserted, TextDeleted, BlockSplit, BlocksMerged, BlockInserted, BlockDeleted, BlockMoved, TextFormatted, BlockTypeChanged, SectionLayoutChanged } from "./events";
import type { DocumentSnapshot, DocumentTree } from "./DocumentSnapshot";

export type { DocumentId, BlockId, SectionId };

interface DocumentState {
  id: DocumentId;
  sections: Section[];
  buffer: TextBuffer;
  createdAt: number;
  modifiedAt: number;
}

export class Document {
  private state: DocumentState;
  private eventsList: DocumentEvents[] = [];

  private constructor(state: DocumentState) {
    this.state = state;
  }

  static createEmpty(): Document {
    const id = DocumentId.create();
    const buffer = TextBuffer.create();
    
    const paragraphId = BlockId.create();
    const sectionId = SectionId.create();
    
    const paragraph = {
      id: paragraphId,
      type: "paragraph" as const,
      textRange: new BufferRange(0, 0),
      marks: [] as FormattingMark[],
    };
    
    const section = Section.create(sectionId, [paragraph as Block]);
    
    return new Document({
      id,
      sections: [section],
      buffer,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    });
  }

  static fromText(text: string): Document {
    const doc = Document.createEmpty();
    if (text.length > 0) {
      const firstBlock = doc.getFirstBlock();
      if (firstBlock && isTextBlock(firstBlock)) {
        doc.insertText(firstBlock.id, 0, text);
      }
    }
    return doc;
  }

  static reconstitute(snapshot: DocumentSnapshot): Document {
    const sections = snapshot.tree.root.children.map(s => Section.create(s.id, [...s.children])) as Section[];
    const buffer = TextBuffer.fromContent(snapshot.bufferContent);
    
    return new Document({
      id: snapshot.id,
      sections,
      buffer,
      createdAt: snapshot.createdAt,
      modifiedAt: snapshot.modifiedAt,
    });
  }

  get id(): DocumentId {
    return this.state.id;
  }

  get sections(): readonly Section[] {
    return this.state.sections;
  }

  get createdAt(): number {
    return this.state.createdAt;
  }

  get modifiedAt(): number {
    return this.state.modifiedAt;
  }

  getBuffer(): TextBuffer {
    return this.state.buffer;
  }

  getText(): string {
    return this.state.buffer.getText();
  }

  getFirstBlock(): Block | null {
    const firstSection = this.state.sections[0];
    if (!firstSection) return null;
    return firstSection.children[0] ?? null;
  }

  getBlock(blockId: BlockId): Block | null {
    for (const section of this.state.sections) {
      const found = Section.findBlockById(section, blockId);
      if (found) return found;
    }
    return null;
  }

  getSection(sectionId: SectionId): Section | null {
    return this.state.sections.find(s => s.id === sectionId) ?? null;
  }

  getTextForBlock(blockId: BlockId): string | null {
    const block = this.getBlock(blockId);
    if (!block) return null;
    
    if (isTextBlock(block)) {
      return this.state.buffer.getRange(block.textRange.start, block.textRange.end);
    }
    if (isTable(block)) {
      return this.state.buffer.getRange(block.textRange.start, block.textRange.end);
    }
    return null;
  }

  getBlockRange(blockId: BlockId): BufferRange | null {
    const block = this.getBlock(blockId);
    if (!block) return null;
    
    if (isTextBlock(block)) {
      return block.textRange;
    }
    if (isTable(block)) {
      return block.textRange;
    }
    if (isImage(block)) {
      return new BufferRange(block.bufferPosition, block.bufferPosition + 1);
    }
    return null;
  }

  findBlockAtPosition(bufferOffset: number): { block: Block; localOffset: number } | null {
    for (const section of this.state.sections) {
      for (const block of section.children) {
        const result = this.resolveOffsetInBlock(block, bufferOffset);
        if (result) return result;
      }
    }
    return null;
  }

  private resolveOffsetInBlock(block: Block, bufferOffset: number): { block: Block; localOffset: number } | null {
    if (isTextBlock(block)) {
      if (bufferOffset >= block.textRange.start && bufferOffset <= block.textRange.end) {
        return {
          block,
          localOffset: bufferOffset - block.textRange.start,
        };
      }
    } else if (isTable(block)) {
      if (bufferOffset >= block.textRange.start && bufferOffset <= block.textRange.end) {
        return {
          block,
          localOffset: bufferOffset - block.textRange.start,
        };
      }
    } else if (isImage(block)) {
      if (bufferOffset === block.bufferPosition) {
        return { block, localOffset: 0 };
      }
    } else if (isBlockquote(block)) {
      for (const child of block.children) {
        const result = this.resolveOffsetInBlock(child, bufferOffset);
        if (result) return result;
      }
    } else if (isList(block)) {
      for (const item of block.items) {
        const result = this.resolveOffsetInBlock(item.content, bufferOffset);
        if (result) return result;
      }
    }
    return null;
  }

  insertText(blockId: BlockId, offset: number, text: string): TextInserted | null {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return null;
    
    const blockRange = block.textRange;
    const bufPos = blockRange.start + offset;
    
    this.state.buffer.insert(bufPos, text);
    this.shiftRangesAfter(bufPos, text.length);
    this.shiftMarksInBlockAfter(block, offset, text.length);
    
    const event = DocumentEvents.textInserted(this.state.id, blockId, offset, text);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  deleteText(blockId: BlockId, offset: number, length: number): TextDeleted | null {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return null;
    
    const blockRange = block.textRange;
    const actualLength = Math.min(length, blockRange.length - offset);
    if (actualLength <= 0) return null;
    
    const bufPos = blockRange.start + offset;
    const deletedText = this.state.buffer.getRange(bufPos, bufPos + actualLength);
    
    this.state.buffer.delete(bufPos, actualLength);
    this.shiftRangesAfter(bufPos, -actualLength);
    
    const event = DocumentEvents.textDeleted(this.state.id, blockId, offset, deletedText);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  splitBlock(blockId: BlockId, offset: number): BlockSplit | null {
    const location = this.findSectionAndBlockIndex(blockId);
    if (!location) return null;
    
    const { section, blockIndex } = location;
    const block = section.children[blockIndex];
    if (!block || !isTextBlock(block)) return null;
    
    const newBlockId = BlockId.create();
    const splitPoint = block.textRange.start + offset;
    const leftRange = new BufferRange(block.textRange.start, splitPoint);
    const rightRange = new BufferRange(splitPoint, block.textRange.end);
    
    const rightMarks = block.marks
      .map(m => m.slice(rightRange))
      .filter((m): m is FormattingMark => m !== null)
      .map(m => new FormattingMark(
        new BufferRange(m.start - splitPoint, m.end - splitPoint),
        m.attrs
      ));
    
    const newBlock: Block = {
      id: newBlockId,
      type: "paragraph",
      textRange: rightRange,
      marks: rightMarks,
      textAlign: block.textAlign,
    };
    
    const leftMarks = block.marks
      .map(m => m.slice(leftRange))
      .filter((m): m is FormattingMark => m !== null);
    
    const updatedBlock: Block = {
      ...block,
      textRange: leftRange,
      marks: leftMarks,
    };
    
    const newChildren = [...section.children];
    newChildren[blockIndex] = updatedBlock;
    newChildren.splice(blockIndex + 1, 0, newBlock);
    
    this.updateSectionChildren(section.id, newChildren);
    
    const event = DocumentEvents.blockSplit(this.state.id, blockId, newBlockId, offset);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  mergeBlocks(targetId: BlockId, sourceId: BlockId): BlocksMerged | null {
    const targetBlock = this.getBlock(targetId);
    const sourceBlock = this.getBlock(sourceId);
    
    if (!targetBlock || !sourceBlock) return null;
    if (!isTextBlock(targetBlock) || !isTextBlock(sourceBlock)) return null;
    
    const targetLocation = this.findSectionAndBlockIndex(targetId);
    if (!targetLocation) return null;
    
    const mergedText = this.state.buffer.getRange(
      sourceBlock.textRange.start,
      sourceBlock.textRange.end
    );
    const deletedMarks = [...sourceBlock.marks];
    
    const newEnd = targetBlock.textRange.end + sourceBlock.textRange.length;
    const newRange = new BufferRange(targetBlock.textRange.start, newEnd);
    
    const shiftedSourceMarks = sourceBlock.marks.map(m => 
      new FormattingMark(
        new BufferRange(
          m.start - sourceBlock.textRange.start + targetBlock.textRange.length, 
          m.end - sourceBlock.textRange.start + targetBlock.textRange.length
        ),
        m.attrs
      )
    );
    
    const mergedMarks = [...targetBlock.marks, ...shiftedSourceMarks];
    
    const updatedBlock: Block = {
      ...targetBlock,
      textRange: newRange,
      marks: mergedMarks,
    };
    
    const targetSection = targetLocation.section;
    const newChildren = targetSection.children.filter(b => b.id !== sourceId);
    const targetIdx = newChildren.findIndex(b => b.id === targetId);
    if (targetIdx >= 0) {
      newChildren[targetIdx] = updatedBlock;
    }
    
    this.updateSectionChildren(targetSection.id, newChildren);
    
    const event = DocumentEvents.blocksMerged(this.state.id, targetId, sourceId, mergedText, deletedMarks);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  formatText(blockId: BlockId, start: number, end: number, attrs: TextAttributes): TextFormatted | null {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return null;
    
    const blockLen = block.textRange.length;
    const clampedStart = Math.max(0, Math.min(start, blockLen));
    const clampedEnd = Math.max(clampedStart, Math.min(end, blockLen));
    
    if (clampedStart >= clampedEnd && !attrs.bold && !attrs.italic) {
      return null;
    }
    
    const range = new BufferRange(clampedStart, clampedEnd);
    const newMarks = mergeFormattingMarks(block.marks, range, attrs);
    
    const updatedBlock: Block = {
      ...block,
      marks: newMarks,
    };
    this.updateBlockInTree(blockId, updatedBlock);
    
    const event = DocumentEvents.textFormatted(this.state.id, blockId, range, attrs);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  changeBlockType(blockId: BlockId, newType: "paragraph" | "heading", level?: 1 | 2 | 3): BlockTypeChanged | null {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return null;
    
    const oldType = block.type;
    const currentLevel = isHeading(block) ? block.level : undefined;
    if (oldType === newType && (newType === "paragraph" || currentLevel === level)) {
      return null;
    }
    
    let updatedBlock: Block;
    if (newType === "paragraph") {
      updatedBlock = {
        id: block.id,
        type: "paragraph",
        textRange: block.textRange,
        marks: block.marks,
        textAlign: block.textAlign,
      };
    } else {
      updatedBlock = {
        id: block.id,
        type: "heading",
        level: level ?? 1,
        textRange: block.textRange,
        marks: block.marks,
        textAlign: block.textAlign,
      };
    }
    
    this.updateBlockInTree(blockId, updatedBlock);
    
    const event = DocumentEvents.blockTypeChanged(this.state.id, blockId, oldType, newType, level);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  setTextAlign(blockId: BlockId, align: TextAlign): void {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return;
    
    const updatedBlock: Block = {
      ...block,
      textAlign: align,
    };
    this.updateBlockInTree(blockId, updatedBlock);
    this.state.modifiedAt = Date.now();
  }

  insertBlock(sectionId: SectionId, index: number, block: Block): BlockInserted | null {
    const section = this.getSection(sectionId);
    if (!section) return null;
    
    const newChildren = [...section.children];
    newChildren.splice(index, 0, block);
    
    this.updateSectionChildren(sectionId, newChildren);
    
    const event = DocumentEvents.blockInserted(this.state.id, sectionId, index, block);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  deleteBlock(blockId: BlockId): BlockDeleted | null {
    const location = this.findSectionAndBlockIndex(blockId);
    if (!location) return null;
    
    const { section, blockIndex } = location;
    const block = section.children[blockIndex];
    if (!block) return null;
    
    const newChildren = section.children.filter((_, i) => i !== blockIndex);
    this.updateSectionChildren(section.id, newChildren);
    
    const event = DocumentEvents.blockDeleted(this.state.id, blockId, block);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  moveBlock(blockId: BlockId, newSectionId: SectionId, newIndex: number): BlockMoved | null {
    const oldLocation = this.findSectionAndBlockIndex(blockId);
    if (!oldLocation) return null;
    
    const { section: oldSection, blockIndex: oldIndex } = oldLocation;
    const block = oldSection.children[oldIndex];
    if (!block) return null;
    
    const newSection = this.getSection(newSectionId);
    if (!newSection) return null;
    
    const oldSectionId = oldSection.id;
    
    if (oldSectionId === newSectionId) {
      const newChildren = [...oldSection.children];
      newChildren.splice(oldIndex, 1);
      newChildren.splice(newIndex > oldIndex ? newIndex - 1 : newIndex, 0, block);
      this.updateSectionChildren(oldSectionId, newChildren);
    } else {
      const oldChildren = oldSection.children.filter((_, i) => i !== oldIndex);
      this.updateSectionChildren(oldSectionId, oldChildren);
      
      const newChildren = [...newSection.children];
      newChildren.splice(newIndex, 0, block);
      this.updateSectionChildren(newSectionId, newChildren);
    }
    
    const event = DocumentEvents.blockMoved(this.state.id, blockId, newSectionId, newIndex, oldSectionId, oldIndex);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  setSectionLayout(sectionId: SectionId, layout: SectionLayout): SectionLayoutChanged | null {
    const section = this.getSection(sectionId);
    if (!section) return null;
    
    const updatedSection = Section.withLayout(section, layout);
    this.updateSection(sectionId, updatedSection);
    
    const event = DocumentEvents.sectionLayoutChanged(this.state.id, sectionId, layout);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  toSnapshot(): DocumentSnapshot {
    const sections = this.state.sections.map(s => ({ ...s, children: [...s.children] })) as Section[];
    
    return {
      id: this.state.id,
      tree: {
        version: 2,
        root: {
          children: sections,
        },
      },
      bufferContent: this.state.buffer.toContent(),
      createdAt: this.state.createdAt,
      modifiedAt: this.state.modifiedAt,
    };
  }

  pullEvents(): DocumentEvents[] {
    const events = this.eventsList;
    this.eventsList = [];
    return events;
  }

  private findSectionAndBlockIndex(blockId: BlockId): { section: Section; sectionIndex: number; blockIndex: number } | null {
    for (let si = 0; si < this.state.sections.length; si++) {
      const section = this.state.sections[si];
      if (!section) continue;
      for (let bi = 0; bi < section.children.length; bi++) {
        const block = section.children[bi];
        if (block && block.id === blockId) {
          return { section, sectionIndex: si, blockIndex: bi };
        }
      }
    }
    return null;
  }

  private updateSectionChildren(sectionId: SectionId, children: readonly Block[]): void {
    const idx = this.state.sections.findIndex(s => s.id === sectionId);
    if (idx >= 0) {
      const section = this.state.sections[idx];
      if (section) {
        const updatedSection = Section.withChildren(section, children);
        this.state.sections = [...this.state.sections];
        this.state.sections[idx] = updatedSection;
      }
    }
  }

  private updateSection(sectionId: SectionId, section: Section): void {
    const idx = this.state.sections.findIndex(s => s.id === sectionId);
    if (idx >= 0) {
      this.state.sections = [...this.state.sections];
      this.state.sections[idx] = section;
    }
  }

  private updateBlockInTree(blockId: BlockId, updatedBlock: Block): void {
    const location = this.findSectionAndBlockIndex(blockId);
    if (!location) return;
    
    const { section, blockIndex } = location;
    const newChildren = [...section.children];
    newChildren[blockIndex] = updatedBlock;
    this.updateSectionChildren(section.id, newChildren);
  }

  private shiftRangesAfter(pos: number, delta: number): void {
    if (delta === 0) return;
    
    for (const section of this.state.sections) {
      for (let i = 0; i < section.children.length; i++) {
        const block = section.children[i];
        if (!block) continue;
        this.shiftBlockRanges(block, pos, delta, section, i);
      }
    }
  }

  private shiftBlockRanges(block: Block, pos: number, delta: number, section: Section, blockIndex: number): void {
    if (isTextBlock(block)) {
      if (block.textRange.start >= pos) {
        const newRange = new BufferRange(block.textRange.start + delta, block.textRange.end + delta);
        const updated: Block = { ...block, textRange: newRange };
        const newChildren = [...section.children];
        newChildren[blockIndex] = updated;
        this.updateSectionChildren(section.id, newChildren);
      } else if (block.textRange.end > pos) {
        const newRange = new BufferRange(block.textRange.start, block.textRange.end + delta);
        const updated: Block = { ...block, textRange: newRange };
        const newChildren = [...section.children];
        newChildren[blockIndex] = updated;
        this.updateSectionChildren(section.id, newChildren);
      }
    } else if (isImage(block)) {
      if (block.bufferPosition >= pos) {
        const updated: Block = { ...block, bufferPosition: block.bufferPosition + delta };
        const newChildren = [...section.children];
        newChildren[blockIndex] = updated;
        this.updateSectionChildren(section.id, newChildren);
      }
    } else if (isTable(block)) {
      if (block.textRange.start >= pos) {
        const newRange = new BufferRange(block.textRange.start + delta, block.textRange.end + delta);
        const updated: Block = { ...block, textRange: newRange };
        const newChildren = [...section.children];
        newChildren[blockIndex] = updated;
        this.updateSectionChildren(section.id, newChildren);
      } else if (block.textRange.end > pos) {
        const newRange = new BufferRange(block.textRange.start, block.textRange.end + delta);
        const updated: Block = { ...block, textRange: newRange };
        const newChildren = [...section.children];
        newChildren[blockIndex] = updated;
        this.updateSectionChildren(section.id, newChildren);
      }
    }
  }

  private shiftMarksInBlockAfter(block: TextBlock, localPos: number, delta: number): void {
    const shiftedMarks = shiftMarksAfter(block.marks, localPos, delta);
    const updated: Block = { ...block, marks: shiftedMarks };
    this.updateBlockInTree(block.id, updated);
  }

  rangeHasAttribute(blockId: BlockId, start: number, end: number, attr: "bold" | "italic"): boolean {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return false;
    
    const range = new BufferRange(start, end);
    return rangeHasAttr(block.marks, range, attr);
  }
}

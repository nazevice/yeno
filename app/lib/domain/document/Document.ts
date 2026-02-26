import { DocumentId, BlockId, SectionId } from "../shared/NodeId";
import { BufferRange } from "./value-objects/BufferRange";
import { TextAttributes } from "./value-objects/TextAttributes";
import { FormattingMark, mergeFormattingMarks, shiftMarksAfter, rangeHasAttr } from "./value-objects/FormattingMark";
import type { SectionLayout } from "./value-objects/SectionLayout";
import type { TextAlign } from "./value-objects/TextAlign";
import { TextBuffer } from "./buffer/TextBuffer";
import type { TextBufferContent } from "./buffer/TextBufferTypes";
import { Section } from "./entities/Section";
import type { Heading } from "./entities/Heading";
import type { Block, TextBlock } from "./entities";
import { isTextBlock, isParagraph, isHeading, isImage, isTable, isList, isBlockquote } from "./entities";
import { Image, type AssetRef } from "./entities/Image";
import { Table, TableRow, TableCell, TABLE_CELL_SEPARATOR } from "./entities/Table";
import { Paragraph } from "./entities/Paragraph";
import type { TableCellChild } from "./entities/Table";
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
      const found = this.findBlockInTree(section.children, blockId);
      if (found) return found;
    }
    return null;
  }

  private findBlockInTree(blocks: readonly Block[], blockId: BlockId): Block | null {
    for (const block of blocks) {
      if (block.id === blockId) return block;

      if (isTable(block)) {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            const found = this.findBlockInTree(cell.children as Block[], blockId);
            if (found) return found;
          }
        }
      } else if (isList(block)) {
        for (const item of block.items) {
          const found = this.findBlockInTree([item.content], blockId);
          if (found) return found;
        }
      } else if (isBlockquote(block)) {
        const found = this.findBlockInTree(block.children, blockId);
        if (found) return found;
      }
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
        for (const cell of Table.iterCells(block)) {
          if (bufferOffset >= cell.textRange.start && bufferOffset <= cell.textRange.end) {
            for (const child of cell.children) {
              if (bufferOffset >= child.textRange.start && bufferOffset <= child.textRange.end) {
                return {
                  block: child,
                  localOffset: bufferOffset - child.textRange.start,
                };
              }
            }
            const firstChild = cell.children[0];
            if (firstChild) {
              return { block: firstChild, localOffset: firstChild.textRange.length };
            }
          }
        }
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
    this.shiftRangesAfter(bufPos, text.length, blockId);
    
    if (isTextBlock(block)) {
      this.shiftMarksInBlockAfter(block, offset, text.length);
    }
    
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
    this.shiftRangesAfter(bufPos, -actualLength, blockId);
    
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
    
    // Insert newline at the split point
    this.state.buffer.insert(splitPoint, "\n");
    
    // Left block ends at split point (before the newline)
    const leftRange = new BufferRange(block.textRange.start, splitPoint);
    // Right block starts after the newline
    const rightRange = new BufferRange(splitPoint + 1, block.textRange.end + 1);
    
    const rightMarks = block.marks
      .map(m => m.slice(new BufferRange(splitPoint, block.textRange.end)))
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
    
    // Shift ranges for blocks after the new right block
    // The right block ends at block.textRange.end + 1, so shift blocks starting from there
    this.shiftRangesAfter(block.textRange.end + 1, 1);
    
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
    
    // The newline is at the end of the target block (between the two blocks)
    const newlinePos = targetBlock.textRange.end;
    
    // Get merged text before modifying buffer
    const mergedText = this.state.buffer.getRange(
      sourceBlock.textRange.start,
      sourceBlock.textRange.end
    );
    const deletedMarks = [...sourceBlock.marks];
    
    // Delete the newline
    this.state.buffer.delete(newlinePos, 1);
    
    // Merged block: target start to (target length + source length)
    const newEnd = targetBlock.textRange.start + targetBlock.textRange.length + sourceBlock.textRange.length;
    const newRange = new BufferRange(targetBlock.textRange.start, newEnd);
    
    // Shift source marks: they were relative to source block start, now relative to target block position
    // After merge, source content starts at targetBlock.textRange.length position in merged content
    const shiftedSourceMarks = sourceBlock.marks.map(m => 
      new FormattingMark(
        new BufferRange(
          m.start + targetBlock.textRange.length,
          m.end + targetBlock.textRange.length
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
    
    // Shift all blocks after the merged block
    this.shiftRangesAfter(newEnd, -1, targetId);
    
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

  setImageSize(blockId: BlockId, size: readonly [number, number]): void {
    const block = this.getBlock(blockId);
    if (!block || !isImage(block)) return;
    
    const updatedBlock = Image.withSize(block, size);
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

  insertImageBlock(afterBlockId: BlockId, assetRef: AssetRef, alt: string, size: readonly [number, number]): BlockInserted | null {
    const location = this.findSectionAndBlockIndex(afterBlockId);
    if (!location) return null;
    
    const { section, blockIndex } = location;
    const afterBlock = section.children[blockIndex];
    if (!afterBlock) return null;
    
    const afterBlockRange = this.getBlockRange(afterBlockId);
    if (!afterBlockRange) return null;
    
    const insertPos = afterBlockRange.end;
    const blockId = BlockId.create();
    
    this.state.buffer.insert(insertPos, "\n\uFFFC");
    
    const imageBlock = Image.create(blockId, insertPos + 1, assetRef, alt, size);
    
    this.shiftRangesAfter(insertPos, 2, afterBlockId);
    
    const newBlockIndex = blockIndex + 1;
    const newChildren = [...section.children];
    newChildren.splice(newBlockIndex, 0, imageBlock);
    this.updateSectionChildren(section.id, newChildren);
    
    const event = DocumentEvents.blockInserted(this.state.id, section.id, newBlockIndex, imageBlock);
    this.eventsList.push(event);
    this.state.modifiedAt = Date.now();
    
    return event;
  }

  insertTableBlock(afterBlockId: BlockId, rows: number, cols: number): BlockInserted | null {
    const location = this.findSectionAndBlockIndex(afterBlockId);
    if (!location) return null;
    
    const { section, blockIndex } = location;
    const afterBlock = section.children[blockIndex];
    if (!afterBlock) return null;
    
    const afterBlockRange = this.getBlockRange(afterBlockId);
    if (!afterBlockRange) return null;
    
    const insertPos = afterBlockRange.end;
    const tableId = BlockId.create();
    const colWidths = Array.from({ length: cols }, () => 100);
    const numCells = rows * cols;
    const cellContents = Array.from({ length: numCells }, () => "");
    const tableText = "\n" + cellContents.join(TABLE_CELL_SEPARATOR);
    
    this.state.buffer.insert(insertPos, tableText);
    
    let bufPos = insertPos + 1;
    const tableRows: TableRow[] = [];
    const totalCells = rows * cols;
    let cellIndex = 0;
    for (let r = 0; r < rows; r++) {
      const cells: TableCell[] = [];
      for (let c = 0; c < cols; c++) {
        const cellId = BlockId.create();
        const paraId = BlockId.create();
        const cellRange = new BufferRange(bufPos, bufPos);
        const paragraph = Paragraph.create(paraId, cellRange, []);
        cells.push(TableCell.create(cellId, cellRange, [paragraph]));
        
        if (cellIndex < totalCells - 1) {
          bufPos += 1;
        }
        cellIndex += 1;
      }
      tableRows.push(TableRow.create(cells));
    }
    
    const textRange = new BufferRange(insertPos, insertPos + tableText.length);
    const tableBlock = Table.create(tableId, textRange, tableRows, colWidths);
    
    this.shiftRangesAfter(insertPos, tableText.length, afterBlockId);
    
    const newBlockIndex = blockIndex + 1;
    const newChildren = [...section.children];
    newChildren.splice(newBlockIndex, 0, tableBlock);
    this.updateSectionChildren(section.id, newChildren);
    
    const event = DocumentEvents.blockInserted(this.state.id, section.id, newBlockIndex, tableBlock);
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
    if (location) {
      const { section, blockIndex } = location;
      const newChildren = [...section.children];
      newChildren[blockIndex] = updatedBlock;
      this.updateSectionChildren(section.id, newChildren);
      return;
    }
    const tableLocation = this.findTableContainingBlock(blockId);
    if (tableLocation) {
      const { section, blockIndex, table } = tableLocation;
      const newRows = table.rows.map((row) =>
        TableRow.create(
          row.cells.map((cell) =>
            TableCell.withChildren(
              cell,
              cell.children.map((ch) => (ch.id === blockId ? (updatedBlock as TableCellChild) : ch)),
            ),
          ),
        ),
      );
      const updatedTable = Table.withRows(table, newRows);
      const newChildren = [...section.children];
      newChildren[blockIndex] = updatedTable;
      this.updateSectionChildren(section.id, newChildren);
    }
  }

  private findTableContainingBlock(blockId: BlockId): {
    section: Section;
    blockIndex: number;
    table: Table;
  } | null {
    for (let si = 0; si < this.state.sections.length; si++) {
      const section = this.state.sections[si];
      if (!section) continue;
      for (let bi = 0; bi < section.children.length; bi++) {
        const block = section.children[bi];
        if (block?.type === "table" && Table.findBlockById(block, blockId)) {
          return { section, blockIndex: bi, table: block };
        }
      }
    }
    return null;
  }

  private shiftRangesAfter(pos: number, delta: number, sourceBlockId?: BlockId): void {
    if (delta === 0) return;
    
    // Process each block - we need to be careful because updateSectionChildren 
    // creates a new sections array, so we should collect all updates and apply them together
    // to avoid iterating over stale data
    
    const updates: Array<{ sectionId: SectionId; blockIndex: number; updatedBlock: Block }> = [];
    
    for (const section of this.state.sections) {
      for (let i = 0; i < section.children.length; i++) {
        const block = section.children[i];
        if (!block) continue;
        const result = this.computeShiftedBlock(block, pos, delta, sourceBlockId);
        if (result) {
          updates.push({ sectionId: section.id, blockIndex: i, updatedBlock: result });
        }
      }
    }
    
    // Apply all updates - batch them by section to minimize array recreations
    const sectionUpdates = new Map<SectionId, Map<number, Block>>();
    for (const { sectionId, blockIndex, updatedBlock } of updates) {
      if (!sectionUpdates.has(sectionId)) {
        sectionUpdates.set(sectionId, new Map());
      }
      sectionUpdates.get(sectionId)!.set(blockIndex, updatedBlock);
    }
    
    for (const [sectionId, blockUpdates] of sectionUpdates) {
      const section = this.state.sections.find(s => s.id === sectionId);
      if (!section) continue;
      const newChildren = [...section.children];
      for (const [blockIndex, updatedBlock] of blockUpdates) {
        newChildren[blockIndex] = updatedBlock;
      }
      this.updateSectionChildren(sectionId, newChildren);
    }
  }

  private computeShiftedBlock(block: Block, pos: number, delta: number, sourceBlockId?: BlockId): Block | null {
    if (isTextBlock(block)) {
      const { start, end } = block.textRange;
      const isSourceBlock = block.id === sourceBlockId;
      
      if (delta > 0 && start === end && pos === start) {
        return { ...block, textRange: new BufferRange(start, start + delta) };
      } else if (!isSourceBlock && start >= pos) {
        return { ...block, textRange: new BufferRange(start + delta, end + delta) };
      } else if (end >= pos) {
        return { ...block, textRange: new BufferRange(start, end + delta) };
      }
    } else if (isImage(block)) {
      if (block.bufferPosition >= pos) {
        return { ...block, bufferPosition: block.bufferPosition + delta };
      }
    } else if (isTable(block)) {
      const shiftedRows = block.rows.map((row) =>
        TableRow.create(
          row.cells.map((cell) => {
            const isSourceCell = sourceBlockId && cell.children.some((ch) => ch.id === sourceBlockId);
            let newCellRange = cell.textRange;

            if (isSourceCell) {
              newCellRange = new BufferRange(cell.textRange.start, cell.textRange.end + delta);
            } else if (cell.textRange.start >= pos) {
              newCellRange = new BufferRange(
                cell.textRange.start + delta,
                cell.textRange.end + delta,
              );
            } else if (cell.textRange.end > pos) {
              newCellRange = new BufferRange(cell.textRange.start, cell.textRange.end + delta);
            }

            const newChildren = cell.children.map((child) => {
              const isSource = child.id === sourceBlockId;
              
              if (isSource && child.textRange.start === pos) {
                return {
                  ...child,
                  textRange: new BufferRange(child.textRange.start, child.textRange.end + delta),
                };
              }
              if (child.textRange.start >= pos) {
                return {
                  ...child,
                  textRange: new BufferRange(
                    child.textRange.start + delta,
                    child.textRange.end + delta,
                  ),
                };
              }
              if (child.textRange.end > pos || isSource) {
                return {
                  ...child,
                  textRange: new BufferRange(child.textRange.start, child.textRange.end + delta),
                };
              }
              return child;
            });
            
            return TableCell.withTextRange(
              TableCell.withChildren(cell, newChildren),
              newCellRange,
            );
          }),
        ),
      );
      
      const newTableRange =
        block.textRange.start >= pos
          ? new BufferRange(block.textRange.start + delta, block.textRange.end + delta)
          : block.textRange.end > pos
            ? new BufferRange(block.textRange.start, block.textRange.end + delta)
            : block.textRange;
            
      return Table.withTextRange(Table.withRows(block, shiftedRows), newTableRange);
    }
    return null;
  }

  private shiftMarksInBlockAfter(block: TextBlock, localPos: number, delta: number): void {
    const currentBlock = this.getBlock(block.id);
    if (!currentBlock || !isTextBlock(currentBlock)) return;
    const shiftedMarks = shiftMarksAfter(currentBlock.marks, localPos, delta);
    const updated: Block = { ...currentBlock, marks: shiftedMarks };
    this.updateBlockInTree(block.id, updated);
  }

  rangeHasAttribute(blockId: BlockId, start: number, end: number, attr: "bold" | "italic" | "underline"): boolean {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return false;
    
    const range = new BufferRange(start, end);
    return rangeHasAttr(block.marks, range, attr);
  }

  getMarksAtOffset(blockId: BlockId, offset: number): TextAttributes {
    const block = this.getBlock(blockId);
    if (!block || !isTextBlock(block)) return TextAttributes.empty;
    
    let result = TextAttributes.empty;
    for (const mark of block.marks) {
      if (offset >= mark.start && offset <= mark.end) {
        result = result.merge(mark.attrs);
      }
    }
    return result;
  }

  getBlocksInRange(startOffset: number, endOffset: number): Block[] {
    if (startOffset >= endOffset) return [];
    
    const result: Block[] = [];
    
    for (const section of this.state.sections) {
      for (const block of section.children) {
        const blockResult = this.collectBlocksInRange(block, startOffset, endOffset);
        result.push(...blockResult);
      }
    }
    
    return result;
  }

  private collectBlocksInRange(block: Block, startOffset: number, endOffset: number): Block[] {
    const result: Block[] = [];
    
    if (isTextBlock(block)) {
      const blockStart = block.textRange.start;
      const blockEnd = block.textRange.end;
      
      if (blockEnd > startOffset && blockStart < endOffset) {
        result.push(block);
      }
    } else if (isImage(block)) {
      if (block.bufferPosition >= startOffset && block.bufferPosition < endOffset) {
        result.push(block);
      }
    } else if (isTable(block)) {
      const tableStart = block.textRange.start;
      const tableEnd = block.textRange.end;
      
      if (tableEnd > startOffset && tableStart < endOffset) {
        result.push(block);
      }
    } else if (isBlockquote(block)) {
      for (const child of block.children) {
        result.push(...this.collectBlocksInRange(child, startOffset, endOffset));
      }
    } else if (isList(block)) {
      for (const item of block.items) {
        result.push(...this.collectBlocksInRange(item.content, startOffset, endOffset));
      }
    }
    
    return result;
  }

  getTextInRange(startOffset: number, endOffset: number): string {
    if (startOffset >= endOffset) return "";
    return this.state.buffer.getRange(startOffset, endOffset);
  }

  deleteRange(startOffset: number, endOffset: number): void {
    if (startOffset >= endOffset) return;
    
    const length = endOffset - startOffset;
    this.state.buffer.delete(startOffset, length);
    this.shiftRangesAfter(startOffset, -length);
    this.state.modifiedAt = Date.now();
  }
}

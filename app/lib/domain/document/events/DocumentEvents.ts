import type { BlockId, SectionId, DocumentId } from "../../shared/NodeId";
import type { DocumentEvent, DocumentEventType } from "./DocumentEvent";
import type { Block } from "../entities";
import type { BufferRange } from "../value-objects/BufferRange";
import type { TextAttributes } from "../value-objects/TextAttributes";
import type { FormattingMark } from "../value-objects/FormattingMark";
import type { SectionLayout } from "../value-objects/SectionLayout";

export interface TextInserted extends DocumentEvent {
  readonly type: "text_inserted";
  readonly blockId: BlockId;
  readonly offset: number;
  readonly text: string;
}

export interface TextDeleted extends DocumentEvent {
  readonly type: "text_deleted";
  readonly blockId: BlockId;
  readonly offset: number;
  readonly deletedText: string;
  readonly length: number;
}

export interface BlockSplit extends DocumentEvent {
  readonly type: "block_split";
  readonly originalBlockId: BlockId;
  readonly newBlockId: BlockId;
  readonly splitOffset: number;
}

export interface BlocksMerged extends DocumentEvent {
  readonly type: "blocks_merged";
  readonly survivingBlockId: BlockId;
  readonly deletedBlockId: BlockId;
  readonly mergedText: string;
  readonly deletedMarks: readonly FormattingMark[];
}

export interface BlockInserted extends DocumentEvent {
  readonly type: "block_inserted";
  readonly parentSectionId: SectionId;
  readonly index: number;
  readonly block: Block;
}

export interface BlockDeleted extends DocumentEvent {
  readonly type: "block_deleted";
  readonly blockId: BlockId;
  readonly deletedBlock: Block;
}

export interface BlockMoved extends DocumentEvent {
  readonly type: "block_moved";
  readonly blockId: BlockId;
  readonly newParentId: SectionId;
  readonly newIndex: number;
  readonly oldParentId: SectionId;
  readonly oldIndex: number;
}

export interface TextFormatted extends DocumentEvent {
  readonly type: "text_formatted";
  readonly blockId: BlockId;
  readonly range: BufferRange;
  readonly attrs: TextAttributes;
}

export interface BlockTypeChanged extends DocumentEvent {
  readonly type: "block_type_changed";
  readonly blockId: BlockId;
  readonly oldType: "paragraph" | "heading";
  readonly newType: "paragraph" | "heading";
  readonly newLevel?: 1 | 2 | 3 | undefined;
}

export interface SectionLayoutChanged extends DocumentEvent {
  readonly type: "section_layout_changed";
  readonly sectionId: SectionId;
  readonly layout: SectionLayout;
}

export type DocumentEvents =
  | TextInserted
  | TextDeleted
  | BlockSplit
  | BlocksMerged
  | BlockInserted
  | BlockDeleted
  | BlockMoved
  | TextFormatted
  | BlockTypeChanged
  | SectionLayoutChanged;

export namespace DocumentEvents {
  export function textInserted(
    documentId: DocumentId,
    blockId: BlockId,
    offset: number,
    text: string
  ): TextInserted {
    return {
      type: "text_inserted",
      timestamp: Date.now(),
      documentId,
      blockId,
      offset,
      text,
    };
  }

  export function textDeleted(
    documentId: DocumentId,
    blockId: BlockId,
    offset: number,
    deletedText: string
  ): TextDeleted {
    return {
      type: "text_deleted",
      timestamp: Date.now(),
      documentId,
      blockId,
      offset,
      deletedText,
      length: deletedText.length,
    };
  }

  export function blockSplit(
    documentId: DocumentId,
    originalBlockId: BlockId,
    newBlockId: BlockId,
    splitOffset: number
  ): BlockSplit {
    return {
      type: "block_split",
      timestamp: Date.now(),
      documentId,
      originalBlockId,
      newBlockId,
      splitOffset,
    };
  }

  export function blocksMerged(
    documentId: DocumentId,
    survivingBlockId: BlockId,
    deletedBlockId: BlockId,
    mergedText: string,
    deletedMarks: readonly FormattingMark[]
  ): BlocksMerged {
    return {
      type: "blocks_merged",
      timestamp: Date.now(),
      documentId,
      survivingBlockId,
      deletedBlockId,
      mergedText,
      deletedMarks,
    };
  }

  export function blockInserted(
    documentId: DocumentId,
    parentSectionId: SectionId,
    index: number,
    block: Block
  ): BlockInserted {
    return {
      type: "block_inserted",
      timestamp: Date.now(),
      documentId,
      parentSectionId,
      index,
      block,
    };
  }

  export function blockDeleted(
    documentId: DocumentId,
    blockId: BlockId,
    deletedBlock: Block
  ): BlockDeleted {
    return {
      type: "block_deleted",
      timestamp: Date.now(),
      documentId,
      blockId,
      deletedBlock,
    };
  }

  export function blockMoved(
    documentId: DocumentId,
    blockId: BlockId,
    newParentId: SectionId,
    newIndex: number,
    oldParentId: SectionId,
    oldIndex: number
  ): BlockMoved {
    return {
      type: "block_moved",
      timestamp: Date.now(),
      documentId,
      blockId,
      newParentId,
      newIndex,
      oldParentId,
      oldIndex,
    };
  }

  export function textFormatted(
    documentId: DocumentId,
    blockId: BlockId,
    range: BufferRange,
    attrs: TextAttributes
  ): TextFormatted {
    return {
      type: "text_formatted",
      timestamp: Date.now(),
      documentId,
      blockId,
      range,
      attrs,
    };
  }

  export function blockTypeChanged(
    documentId: DocumentId,
    blockId: BlockId,
    oldType: "paragraph" | "heading",
    newType: "paragraph" | "heading",
    newLevel?: 1 | 2 | 3
  ): BlockTypeChanged {
    return {
      type: "block_type_changed",
      timestamp: Date.now(),
      documentId,
      blockId,
      oldType,
      newType,
      newLevel,
    };
  }

  export function sectionLayoutChanged(
    documentId: DocumentId,
    sectionId: SectionId,
    layout: SectionLayout
  ): SectionLayoutChanged {
    return {
      type: "section_layout_changed",
      timestamp: Date.now(),
      documentId,
      sectionId,
      layout,
    };
  }
}

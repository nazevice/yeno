import type { DocumentId } from "../../shared/NodeId";

export type DocumentEventType =
  | "text_inserted"
  | "text_deleted"
  | "block_split"
  | "blocks_merged"
  | "block_inserted"
  | "block_deleted"
  | "block_moved"
  | "text_formatted"
  | "block_type_changed"
  | "section_layout_changed";

export interface DocumentEvent {
  readonly type: DocumentEventType;
  readonly timestamp: number;
  readonly documentId: DocumentId;
}

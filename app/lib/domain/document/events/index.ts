export type { DocumentEvent, DocumentEventType } from "./DocumentEvent";
export type {
  DocumentEvents as DocumentEventUnion,
  TextInserted,
  TextDeleted,
  BlockSplit,
  BlocksMerged,
  BlockInserted,
  BlockDeleted,
  BlockMoved,
  TextFormatted,
  BlockTypeChanged,
  SectionLayoutChanged,
} from "./DocumentEvents";
export { DocumentEvents } from "./DocumentEvents";

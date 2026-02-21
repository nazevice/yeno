/**
 * Document schema – Tree over Buffer architecture.
 * All nodes have stable IDs (UUID v4) for CRDT preparation.
 */

export type EditorMode = "continuous" | "paginated";

export const OBJECT_REPLACEMENT_CHAR = "\uFFFC";

export type NodeId = string;

export interface TextRange {
  start: number;
  end: number;
}

export interface InlineMark {
  start: number;
  end: number;
  attrs?: {
    b?: boolean;
    i?: boolean;
    font?: string;
    fontSize?: number;
  };
}

export interface InlineObjectRef {
  assetId: string;
}

export interface AssetRef {
  name: string;
  targetPos: number;
  alt: string;
  size: [number, number];
  bytes: number[];
}

// ─── Block nodes ─────────────────────────────────────────────────────────────

export interface ParagraphNode {
  id: NodeId;
  type: "paragraph";
  textRange: TextRange;
  marks: InlineMark[];
  inlineObjects?: Record<string, InlineObjectRef>;
}

export interface HeadingNode {
  id: NodeId;
  type: "heading";
  level: 1 | 2 | 3;
  textRange: TextRange;
  marks: InlineMark[];
}

export interface ImageNode {
  id: NodeId;
  type: "image";
  bufferPosition: number;
  assetRef: AssetRef;
  alt: string;
  size: [number, number];
}

export interface ListItemNode {
  id: NodeId;
  type: "listItem";
  content: ParagraphNode | HeadingNode;
}

export interface ListNode {
  id: NodeId;
  type: "list";
  listType: "ordered" | "unordered";
  items: ListItemNode[];
}

export interface BlockquoteNode {
  id: NodeId;
  type: "blockquote";
  children: (ParagraphNode | HeadingNode)[];
}

export interface TableNode {
  id: NodeId;
  type: "table";
  textRange: TextRange;
  rows: number;
  cols: number;
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | ImageNode
  | BlockquoteNode
  | ListNode
  | TableNode;

// ─── Section ────────────────────────────────────────────────────────────────

export interface SectionMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SectionNode {
  id: NodeId;
  type: "section";
  children: BlockNode[];
  margins?: SectionMargins;
  orientation?: "portrait" | "landscape";
  headers?: Record<string, string>;
  footers?: Record<string, string>;
}

// ─── Document tree ──────────────────────────────────────────────────────────

export interface DocumentTree {
  version: 2;
  root: {
    children: SectionNode[];
  };
}

// ─── Piece table (TextBuffer) ────────────────────────────────────────────────

export type ChunkType = "original" | "insert" | "delete";

export interface PieceChunk {
  type: ChunkType;
  offset?: number;
  len?: number;
  source?: string;
  pos?: number;
  data?: string;
}

export interface PieceTableContent {
  baseText: string;
  chunks: PieceChunk[];
}

// ─── Document payload (persistence) ─────────────────────────────────────────

export interface DocumentPayload {
  baseText: string;
  chunks: PieceChunk[];
  metadata: { custom?: Record<string, unknown> };
  versions: unknown[];
  assets: AssetRef[];
  documentTree: DocumentTree;
}

export interface SaveRequest {
  path: string;
  payload: DocumentPayload;
}

export interface ExportRequest {
  path: string;
  baseText: string;
  chunks: PieceChunk[];
}

export interface PerfSnapshot {
  operation: string;
  elapsedMs: number;
  payloadBytes: number;
}

// ─── Operations (CRDT-prep) ──────────────────────────────────────────────────

export type Operation =
  | { type: "insert"; nodeId: NodeId; offset: number; text: string }
  | { type: "delete"; nodeId: NodeId; offset: number; len: number }
  | {
      type: "format";
      nodeId: NodeId;
      start: number;
      end: number;
      attrs: Record<string, unknown>;
    }
  | { type: "insertBlock"; afterNodeId: NodeId | null; block: BlockNode }
  | { type: "deleteBlock"; nodeId: NodeId };

// ─── Selection ──────────────────────────────────────────────────────────────

export interface SelectionPoint {
  nodeId: NodeId;
  offset: number;
}

export interface EditorSelection {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export type EditorMode = "continuous" | "paginated";

export interface PieceChunk {
  type: "original" | "insert" | "delete";
  offset?: number;
  len?: number;
  source?: string;
  pos?: number;
  data?: string;
}

export interface MetadataRange {
  start: number;
  end: number;
  attrs?: Record<string, unknown>;
  type?: string;
  level?: number;
}

export interface MetadataPayload {
  ranges: MetadataRange[];
  embeddings?: Record<string, unknown>;
  custom?: Record<string, unknown>;
}

export interface AssetRef {
  name: string;
  targetPos: number;
  alt: string;
  size: [number, number];
  bytes: number[];
}

export interface DocumentPayload {
  baseText: string;
  chunks: PieceChunk[];
  metadata: MetadataPayload;
  versions: unknown[];
  assets: AssetRef[];
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

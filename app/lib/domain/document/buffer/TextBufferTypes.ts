export type ChunkType = "original" | "insert" | "delete";

export interface PieceChunk {
  readonly type: ChunkType;
  readonly pos?: number | undefined;
  readonly data?: string | undefined;
  readonly len?: number | undefined;
}

export interface TextBufferContent {
  readonly baseText: string;
  readonly chunks: readonly PieceChunk[];
}

export type { TextBufferContent as TextBufferSnapshot };

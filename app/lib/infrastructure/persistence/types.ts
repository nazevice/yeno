import type { PieceChunk } from "../../domain/document/buffer/TextBufferTypes";
import type { AssetRef } from "../../domain/document/entities/Image";
import type { Section } from "../../domain/document/entities/Section";

export interface DocumentPayload {
  baseText: string;
  chunks: PieceChunk[];
  metadata: { custom?: Record<string, unknown> | undefined };
  versions: unknown[];
  assets: AssetRef[];
  documentTree: {
    version: 2;
    root: { children: Section[] };
  };
}

export interface SaveRequest {
  path: string;
  payload: DocumentPayload;
}

export interface LoadRequest {
  path: string;
}

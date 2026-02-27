import type { DocumentId } from "../shared/NodeId";
import type { Section } from "./entities";
import type { TextBufferContent } from "./buffer/TextBufferTypes";

export interface DocumentMetadata {
  readonly title?: string;
  readonly author?: string;
}

export interface DocumentTree {
  readonly version: 2;
  readonly root: {
    readonly children: readonly Section[];
  };
}

export interface DocumentSnapshot {
  readonly id: DocumentId;
  readonly tree: DocumentTree;
  readonly bufferContent: TextBufferContent;
  readonly metadata: DocumentMetadata;
  readonly createdAt: number;
  readonly modifiedAt: number;
}

export namespace DocumentSnapshot {
  export function create(
    id: DocumentId,
    tree: DocumentTree,
    bufferContent: TextBufferContent,
    createdAt?: number,
    metadata?: DocumentMetadata
  ): DocumentSnapshot {
    const now = Date.now();
    return {
      id,
      tree,
      bufferContent,
      metadata: metadata ?? {},
      createdAt: createdAt ?? now,
      modifiedAt: now,
    };
  }

  export function withTree(snapshot: DocumentSnapshot, tree: DocumentTree): DocumentSnapshot {
    return {
      ...snapshot,
      tree,
      modifiedAt: Date.now(),
    };
  }

  export function withBufferContent(snapshot: DocumentSnapshot, bufferContent: TextBufferContent): DocumentSnapshot {
    return {
      ...snapshot,
      bufferContent,
      modifiedAt: Date.now(),
    };
  }

  export function withMetadata(snapshot: DocumentSnapshot, metadata: DocumentMetadata): DocumentSnapshot {
    return {
      ...snapshot,
      metadata,
      modifiedAt: Date.now(),
    };
  }
}

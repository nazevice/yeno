declare const NodeIdBrand: unique symbol;
declare const BlockIdBrand: unique symbol;
declare const SectionIdBrand: unique symbol;
declare const DocumentIdBrand: unique symbol;

export type NodeId = string & { readonly [NodeIdBrand]: typeof NodeIdBrand };
export type BlockId = NodeId & { readonly [BlockIdBrand]: typeof BlockIdBrand };
export type SectionId = NodeId & { readonly [SectionIdBrand]: typeof SectionIdBrand };
export type DocumentId = string & { readonly [DocumentIdBrand]: typeof DocumentIdBrand };

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export namespace NodeId {
  export function create(): NodeId {
    return generateUuid() as NodeId;
  }

  export function from(value: string): NodeId {
    return value as NodeId;
  }

  export function equals(a: NodeId, b: NodeId): boolean {
    return a === b;
  }

  export function toString(id: NodeId): string {
    return id as string;
  }
}

export namespace BlockId {
  export function create(): BlockId {
    return NodeId.create() as BlockId;
  }

  export function from(value: string): BlockId {
    return value as BlockId;
  }

  export function equals(a: BlockId, b: BlockId): boolean {
    return a === b;
  }

  export function toString(id: BlockId): string {
    return id as string;
  }
}

export namespace SectionId {
  export function create(): SectionId {
    return NodeId.create() as SectionId;
  }

  export function from(value: string): SectionId {
    return value as SectionId;
  }

  export function equals(a: SectionId, b: SectionId): boolean {
    return a === b;
  }

  export function toString(id: SectionId): string {
    return id as string;
  }
}

export namespace DocumentId {
  export function create(): DocumentId {
    return generateUuid() as DocumentId;
  }

  export function from(value: string): DocumentId {
    return value as DocumentId;
  }

  export function equals(a: DocumentId, b: DocumentId): boolean {
    return a === b;
  }

  export function toString(id: DocumentId): string {
    return id as string;
  }
}

import type { BlockBase } from "./Block";
import type { Paragraph } from "./Paragraph";
import type { Heading } from "./Heading";
import type { BufferRange } from "../value-objects/BufferRange";

export type BlockquoteChild = Paragraph | Heading;

export interface Blockquote extends BlockBase {
  readonly type: "blockquote";
  readonly children: readonly BlockquoteChild[];
}

export namespace Blockquote {
  export function create(id: BlockBase["id"], children: readonly BlockquoteChild[] = []): Blockquote {
    return {
      id,
      type: "blockquote",
      children,
    };
  }

  export function withChildren(blockquote: Blockquote, children: readonly BlockquoteChild[]): Blockquote {
    return { ...blockquote, children };
  }

  export function getBufferRange(blockquote: Blockquote): BufferRange | null {
    if (blockquote.children.length === 0) return null;
    
    let start: number | null = null;
    let end: number | null = null;
    
    for (const child of blockquote.children) {
      const range = child.textRange;
      if (start === null || range.start < start) start = range.start;
      if (end === null || range.end > end) end = range.end;
    }
    
    if (start === null || end === null) return null;
    return { start, end } as BufferRange;
  }
}

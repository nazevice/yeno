import type { BlockBase } from "./Block";
import type { BlockId } from "../../shared/NodeId";
import type { Paragraph } from "./Paragraph";
import type { Heading } from "./Heading";
import type { BufferRange } from "../value-objects/BufferRange";

export type ListType = "ordered" | "unordered";

export interface ListItem {
  readonly id: BlockId;
  readonly type: "listItem";
  readonly content: Paragraph | Heading;
}

export interface List extends BlockBase {
  readonly type: "list";
  readonly listType: ListType;
  readonly items: readonly ListItem[];
}

export namespace ListItem {
  export function create(id: BlockId, content: Paragraph | Heading): ListItem {
    return {
      id,
      type: "listItem",
      content,
    };
  }

  export function withContent(item: ListItem, content: Paragraph | Heading): ListItem {
    return { ...item, content };
  }
}

export namespace List {
  export function create(id: BlockBase["id"], listType: ListType, items: readonly ListItem[] = []): List {
    return {
      id,
      type: "list",
      listType,
      items,
    };
  }

  export function withListType(list: List, listType: ListType): List {
    return { ...list, listType };
  }

  export function withItems(list: List, items: readonly ListItem[]): List {
    return { ...list, items };
  }

  export function getBufferRange(list: List): BufferRange | null {
    if (list.items.length === 0) return null;
    
    let start: number | null = null;
    let end: number | null = null;
    
    for (const item of list.items) {
      const range = item.content.textRange;
      if (start === null || range.start < start) start = range.start;
      if (end === null || range.end > end) end = range.end;
    }
    
    if (start === null || end === null) return null;
    return { start, end } as BufferRange;
  }
}

import type { BlockId } from "../../shared/NodeId";

export type BlockType = "paragraph" | "heading" | "table" | "image" | "list" | "blockquote" | "toc";

export interface BlockBase {
  readonly id: BlockId;
  readonly type: BlockType;
}

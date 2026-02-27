import type { BlockBase } from "./Block";

export interface TocBlock extends BlockBase {
  readonly type: "toc";
  readonly title?: string | undefined;
}

export namespace TocBlock {
  export function create(id: BlockBase["id"], title?: string): TocBlock {
    return {
      id,
      type: "toc",
      ...(title !== undefined ? { title } : {}),
    };
  }

  export function withTitle(toc: TocBlock, title: string | undefined): TocBlock {
    return { ...toc, ...(title !== undefined ? { title } : {}) };
  }
}

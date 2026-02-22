import type { BlockBase } from "./Block";
import type { BufferRange } from "../value-objects/BufferRange";

export interface Table extends BlockBase {
  readonly type: "table";
  readonly textRange: BufferRange;
  readonly rows: number;
  readonly cols: number;
}

export namespace Table {
  export function create(id: BlockBase["id"], textRange: BufferRange, rows: number, cols: number): Table {
    return {
      id,
      type: "table",
      textRange,
      rows,
      cols,
    };
  }

  export function withTextRange(table: Table, textRange: BufferRange): Table {
    return { ...table, textRange };
  }

  export function withDimensions(table: Table, rows: number, cols: number): Table {
    return { ...table, rows, cols };
  }
}

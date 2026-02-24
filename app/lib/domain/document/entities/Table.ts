import type { BlockBase } from "./Block";
import type { BlockId } from "../../shared/NodeId";
import type { BufferRange } from "../value-objects/BufferRange";
import type { Paragraph } from "./Paragraph";
import type { Heading } from "./Heading";

/** Cell separator in buffer (U+FFFC Object Replacement Character). Row-major order. */
export const TABLE_CELL_SEPARATOR = "\uFFFC";

/** Blocks allowed inside a table cell (Paragraph, Heading). Expandable to List, etc. */
export type TableCellChild = Paragraph | Heading;

export interface TableCell {
  readonly id: BlockId;
  /** Sub-range of the Table's buffer span. This cell owns this slice. */
  readonly textRange: BufferRange;
  /** Recursion: A cell contains blocks (typically Paragraphs). */
  readonly children: readonly TableCellChild[];
}

export interface TableRow {
  readonly cells: readonly TableCell[];
}

export interface Table extends BlockBase {
  readonly type: "table";
  /** The span covering ALL cells in the buffer. */
  readonly textRange: BufferRange;
  readonly rows: readonly TableRow[];
  readonly colWidths: readonly number[];
}

export namespace TableCell {
  export function create(
    id: BlockId,
    textRange: BufferRange,
    children: readonly TableCellChild[] = [],
  ): TableCell {
    return { id, textRange, children };
  }

  export function withTextRange(cell: TableCell, textRange: BufferRange): TableCell {
    return { ...cell, textRange };
  }

  export function withChildren(cell: TableCell, children: readonly TableCellChild[]): TableCell {
    return { ...cell, children };
  }
}

export namespace TableRow {
  export function create(cells: readonly TableCell[]): TableRow {
    return { cells };
  }
}

export namespace Table {
  export function create(
    id: BlockBase["id"],
    textRange: BufferRange,
    rows: readonly TableRow[],
    colWidths: readonly number[],
  ): Table {
    return { id, type: "table", textRange, rows, colWidths };
  }

  export function withTextRange(table: Table, textRange: BufferRange): Table {
    return { ...table, textRange };
  }

  export function withRows(table: Table, rows: readonly TableRow[]): Table {
    return { ...table, rows };
  }

  export function withColWidths(table: Table, colWidths: readonly number[]): Table {
    return { ...table, colWidths };
  }

  /** Number of rows. */
  export function rowCount(table: Table): number {
    return table.rows.length;
  }

  /** Number of columns (from first row). */
  export function colCount(table: Table): number {
    const firstRow = table.rows[0];
    return firstRow ? firstRow.cells.length : 0;
  }

  /** Find a block (paragraph/heading) by id within the table. */
  export function findBlockById(table: Table, blockId: BlockId): TableCellChild | null {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        for (const child of cell.children) {
          if (child.id === blockId) return child;
        }
      }
    }
    return null;
  }

  /** Find the cell containing the given block id. */
  export function findCellByBlockId(table: Table, blockId: BlockId): TableCell | null {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        for (const child of cell.children) {
          if (child.id === blockId) return cell;
        }
      }
    }
    return null;
  }

  /** Iterate all cells in row-major order. */
  export function* iterCells(table: Table): Generator<TableCell> {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        yield cell;
      }
    }
  }
}

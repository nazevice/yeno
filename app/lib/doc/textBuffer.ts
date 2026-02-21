/**
 * TextBuffer – Piece Table implementation for the document model.
 * Matches Rust PieceTableContent semantics (insert/delete chunks applied in order).
 */

import type { PieceChunk, PieceTableContent } from "./schema";

export class TextBuffer {
  private baseText: string;
  private chunks: PieceChunk[];

  constructor(content?: PieceTableContent) {
    if (content) {
      this.baseText = content.baseText;
      this.chunks = [...content.chunks];
    } else {
      this.baseText = "";
      this.chunks = [];
    }
  }

  /** Rebuild full text by applying all chunks. */
  getText(): string {
    let text = this.baseText;
    for (const chunk of this.chunks) {
      if (chunk.type === "insert" && typeof chunk.pos === "number" && chunk.data != null) {
        if (chunk.pos <= text.length) {
          text = text.slice(0, chunk.pos) + chunk.data + text.slice(chunk.pos);
        }
      } else if (chunk.type === "delete" && typeof chunk.pos === "number" && typeof chunk.len === "number") {
        const end = Math.min(chunk.pos + chunk.len, text.length);
        if (chunk.pos < end) {
          text = text.slice(0, chunk.pos) + text.slice(end);
        }
      }
    }
    return text;
  }

  /** Get a range of text. */
  getRange(start: number, end: number): string {
    const text = this.getText();
    return text.slice(start, end);
  }

  /** Insert text at position. Appends an Insert chunk. */
  insert(pos: number, text: string): void {
    if (text.length === 0) return;
    this.chunks.push({
      type: "insert",
      pos,
      data: text,
    });
  }

  /** Delete `len` characters starting at `pos`. Appends a Delete chunk. */
  delete(pos: number, len: number): void {
    if (len <= 0) return;
    this.chunks.push({
      type: "delete",
      pos,
      len,
    });
  }

  /** Get the current piece table content (for serialization). */
  toContent(): PieceTableContent {
    return {
      baseText: this.baseText,
      chunks: [...this.chunks],
    };
  }

  /** Replace entire content (e.g. after undo). */
  replaceContent(content: PieceTableContent): void {
    this.baseText = content.baseText;
    this.chunks = [...content.chunks];
  }

  /** Get the number of chunks (for debugging). */
  chunkCount(): number {
    return this.chunks.length;
  }
}

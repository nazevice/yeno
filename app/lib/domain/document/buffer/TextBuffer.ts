import type { PieceChunk, TextBufferContent } from "./TextBufferTypes";

export class TextBuffer {
  private baseText: string;
  private chunks: PieceChunk[];

  private constructor(content?: TextBufferContent) {
    if (content) {
      this.baseText = content.baseText;
      this.chunks = [...content.chunks];
    } else {
      this.baseText = "";
      this.chunks = [];
    }
  }

  static create(): TextBuffer {
    return new TextBuffer();
  }

  static fromContent(content: TextBufferContent): TextBuffer {
    return new TextBuffer(content);
  }

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

  getRange(start: number, end: number): string {
    const text = this.getText();
    return text.slice(start, end);
  }

  length(): number {
    return this.getText().length;
  }

  insert(pos: number, text: string): void {
    if (text.length === 0) return;
    this.chunks.push({
      type: "insert",
      pos,
      data: text,
    });
  }

  delete(pos: number, len: number): void {
    if (len <= 0) return;
    this.chunks.push({
      type: "delete",
      pos,
      len,
    });
  }

  toContent(): TextBufferContent {
    return {
      baseText: this.baseText,
      chunks: [...this.chunks],
    };
  }

  replaceContent(content: TextBufferContent): void {
    this.baseText = content.baseText;
    this.chunks = [...content.chunks];
  }

  chunkCount(): number {
    return this.chunks.length;
  }
}

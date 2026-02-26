import type { FormattingMarkData } from "../document/value-objects/FormattingMark";
import type { TextAlign } from "../document/value-objects/TextAlign";

export interface ClipboardTextBlock {
  type: "paragraph" | "heading";
  level?: 1 | 2 | 3;
  text: string;
  marks: FormattingMarkData[];
  textAlign?: TextAlign;
}

export interface ClipboardImageBlock {
  type: "image";
  assetName: string;
  alt: string;
  size: readonly [number, number];
  bytes: readonly number[];
}

export type ClipboardBlock = ClipboardTextBlock | ClipboardImageBlock;

export interface ClipboardPayload {
  version: 1;
  blocks: ClipboardBlock[];
}

export namespace ClipboardPayload {
  export function create(blocks: ClipboardBlock[] = []): ClipboardPayload {
    return { version: 1, blocks };
  }

  export function isEmpty(payload: ClipboardPayload): boolean {
    return payload.blocks.length === 0;
  }

  export function getTextContent(payload: ClipboardPayload): string {
    return payload.blocks
      .filter((b): b is ClipboardTextBlock => b.type === "paragraph" || b.type === "heading")
      .map((b) => b.text)
      .join("\n");
  }
}

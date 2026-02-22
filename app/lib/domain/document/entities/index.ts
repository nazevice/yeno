export type { BlockBase, BlockType } from "./Block";
export type { Paragraph } from "./Paragraph";
export type { Heading, HeadingLevel } from "./Heading";
export type { Table } from "./Table";
export type { Image, AssetRef } from "./Image";
export type { List, ListItem, ListType } from "./List";
export type { Blockquote, BlockquoteChild } from "./Blockquote";
export type { Section } from "./Section";

import type { Paragraph } from "./Paragraph";
import type { Heading } from "./Heading";
import type { Table } from "./Table";
import type { Image } from "./Image";
import type { List } from "./List";
import type { Blockquote } from "./Blockquote";

export type Block = Paragraph | Heading | Table | Image | List | Blockquote;
export type TextBlock = Paragraph | Heading;

export function isTextBlock(block: Block): block is TextBlock {
  return block.type === "paragraph" || block.type === "heading";
}

export function isParagraph(block: Block): block is Paragraph {
  return block.type === "paragraph";
}

export function isHeading(block: Block): block is Heading {
  return block.type === "heading";
}

export function isTable(block: Block): block is Table {
  return block.type === "table";
}

export function isImage(block: Block): block is Image {
  return block.type === "image";
}

export function isList(block: Block): block is List {
  return block.type === "list";
}

export function isBlockquote(block: Block): block is Blockquote {
  return block.type === "blockquote";
}

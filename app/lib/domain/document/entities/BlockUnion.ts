import type { Paragraph } from "./Paragraph";
import type { Heading } from "./Heading";
import type { Table } from "./Table";
import type { Image } from "./Image";
import type { List } from "./List";
import type { Blockquote } from "./Blockquote";
import type { TocBlock } from "./TocBlock";

export type Block = Paragraph | Heading | Table | Image | List | Blockquote | TocBlock;
export type TextBlock = Paragraph | Heading;

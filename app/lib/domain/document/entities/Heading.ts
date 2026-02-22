import type { BlockBase } from "./Block";
import type { BufferRange } from "../value-objects/BufferRange";
import type { FormattingMark } from "../value-objects/FormattingMark";
import type { TextAlign } from "../value-objects/TextAlign";

export type HeadingLevel = 1 | 2 | 3;

export interface Heading extends BlockBase {
  readonly type: "heading";
  readonly level: HeadingLevel;
  readonly textRange: BufferRange;
  readonly marks: readonly FormattingMark[];
  readonly textAlign?: TextAlign | undefined;
}

export namespace Heading {
  export function create(id: BlockBase["id"], level: HeadingLevel, textRange: BufferRange, marks: readonly FormattingMark[] = []): Heading {
    return {
      id,
      type: "heading",
      level,
      textRange,
      marks,
    };
  }

  export function withLevel(heading: Heading, level: HeadingLevel): Heading {
    return { ...heading, level };
  }

  export function withTextRange(heading: Heading, textRange: BufferRange): Heading {
    return { ...heading, textRange };
  }

  export function withMarks(heading: Heading, marks: readonly FormattingMark[]): Heading {
    return { ...heading, marks };
  }

  export function withTextAlign(heading: Heading, textAlign: TextAlign | undefined): Heading {
    return { ...heading, textAlign };
  }
}

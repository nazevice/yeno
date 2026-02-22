import type { BlockBase } from "./Block";
import type { BufferRange } from "../value-objects/BufferRange";
import type { FormattingMark } from "../value-objects/FormattingMark";
import type { TextAlign } from "../value-objects/TextAlign";

export interface Paragraph extends BlockBase {
  readonly type: "paragraph";
  readonly textRange: BufferRange;
  readonly marks: readonly FormattingMark[];
  readonly textAlign?: TextAlign | undefined;
}

export namespace Paragraph {
  export function create(id: BlockBase["id"], textRange: BufferRange, marks: readonly FormattingMark[] = []): Paragraph {
    return {
      id,
      type: "paragraph",
      textRange,
      marks,
    };
  }

  export function withTextRange(paragraph: Paragraph, textRange: BufferRange): Paragraph {
    return { ...paragraph, textRange };
  }

  export function withMarks(paragraph: Paragraph, marks: readonly FormattingMark[]): Paragraph {
    return { ...paragraph, marks };
  }

  export function withTextAlign(paragraph: Paragraph, textAlign: TextAlign | undefined): Paragraph {
    return { ...paragraph, textAlign };
  }
}

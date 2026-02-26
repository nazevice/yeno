import { BufferRange, type BufferRangeData } from "./BufferRange";
import { TextAttributes, type TextAttributesData } from "./TextAttributes";

export interface FormattingMarkData {
  readonly start: number;
  readonly end: number;
  readonly attrs?: TextAttributesData;
}

export class FormattingMark {
  readonly range: BufferRange;
  readonly attrs: TextAttributes;

  constructor(range: BufferRange, attrs: TextAttributes = TextAttributes.empty) {
    this.range = range;
    this.attrs = attrs;
  }

  get start(): number {
    return this.range.start;
  }

  get end(): number {
    return this.range.end;
  }

  get length(): number {
    return this.range.length;
  }

  shift(delta: number): FormattingMark {
    if (delta === 0) return this;
    return new FormattingMark(this.range.shift(delta), this.attrs);
  }

  slice(range: BufferRange): FormattingMark | null {
    const intersection = this.range.intersection(range);
    if (!intersection || intersection.isEmpty) {
      return null;
    }
    return new FormattingMark(intersection, this.attrs);
  }

  canMergeWith(other: FormattingMark): boolean {
    if (!this.attrs.equals(other.attrs)) {
      return false;
    }
    return this.range.overlaps(other.range) || 
           this.range.end === other.range.start || 
           other.range.end === this.range.start;
  }

  mergeWith(other: FormattingMark): FormattingMark | null {
    if (!this.canMergeWith(other)) {
      return null;
    }
    const start = Math.min(this.range.start, other.range.start);
    const end = Math.max(this.range.end, other.range.end);
    return new FormattingMark(new BufferRange(start, end), this.attrs);
  }

  withRange(range: BufferRange): FormattingMark {
    return new FormattingMark(range, this.attrs);
  }

  withAttrs(attrs: TextAttributes): FormattingMark {
    return new FormattingMark(this.range, attrs);
  }

  equals(other: FormattingMark): boolean {
    return this.range.equals(other.range) && this.attrs.equals(other.attrs);
  }

  toJSON(): FormattingMarkData {
    if (this.attrs.hasAny()) {
      return {
        start: this.range.start,
        end: this.range.end,
        attrs: this.attrs.toJSON(),
      };
    }
    return {
      start: this.range.start,
      end: this.range.end,
    };
  }

  static fromJSON(data: FormattingMarkData): FormattingMark {
    const range = new BufferRange(data.start, data.end);
    const attrs = data.attrs ? TextAttributes.fromJSON(data.attrs) : TextAttributes.empty;
    return new FormattingMark(range, attrs);
  }
}

export type { FormattingMarkData as FormattingMarkSnapshot };

export function mergeFormattingMarks(marks: readonly FormattingMark[], range: BufferRange, attrs: TextAttributes): FormattingMark[] {
  const result: FormattingMark[] = [];
  let inserted = false;

  for (const mark of marks) {
    if (mark.range.end <= range.start) {
      result.push(mark);
    } else if (mark.range.start >= range.end) {
      if (!inserted) {
        result.push(new FormattingMark(range, attrs));
        inserted = true;
      }
      result.push(mark);
    } else {
      if (mark.range.start < range.start) {
        result.push(new FormattingMark(
          new BufferRange(mark.range.start, range.start),
          mark.attrs
        ));
      }
      if (!inserted) {
        result.push(new FormattingMark(range, attrs));
        inserted = true;
      }
      if (mark.range.end > range.end) {
        result.push(new FormattingMark(
          new BufferRange(range.end, mark.range.end),
          mark.attrs
        ));
      }
    }
  }

  if (!inserted) {
    result.push(new FormattingMark(range, attrs));
  }

  return compactMarks(result);
}

export function shiftMarksAfter(marks: readonly FormattingMark[], position: number, delta: number): FormattingMark[] {
  return marks.map((mark) => {
    if (mark.start >= position) {
      return mark.shift(delta);
    }
    if (mark.end > position) {
      const newRange = new BufferRange(mark.start, mark.end + delta);
      return new FormattingMark(newRange, mark.attrs);
    }
    return mark;
  });
}

export function deleteMarksInRange(marks: readonly FormattingMark[], range: BufferRange): FormattingMark[] {
  const result: FormattingMark[] = [];
  const delta = -(range.length);

  for (const mark of marks) {
    if (mark.end <= range.start) {
      result.push(mark);
    } else if (mark.start >= range.end) {
      result.push(mark.shift(delta));
    } else {
      const intersection = mark.range.intersection(range);
      if (intersection) {
        const beforeLength = range.start - mark.start;
        const afterStart = mark.start + beforeLength;
        const afterEnd = mark.end - intersection.length;
        
        if (beforeLength > 0) {
          result.push(new FormattingMark(
            new BufferRange(mark.start, range.start),
            mark.attrs
          ));
        }
        if (afterEnd > afterStart) {
          result.push(new FormattingMark(
            new BufferRange(range.start, afterEnd),
            mark.attrs
          ));
        }
      }
    }
  }

  return compactMarks(result);
}

function compactMarks(marks: FormattingMark[]): FormattingMark[] {
  if (marks.length <= 1) return marks;

  const sorted = [...marks].sort((a, b) => a.start - b.start);
  const result: FormattingMark[] = [];

  for (const mark of sorted) {
    if (mark.range.isEmpty) continue;
    
    const last = result[result.length - 1];
    if (last && last.canMergeWith(mark)) {
      const merged = last.mergeWith(mark);
      if (merged) {
        result[result.length - 1] = merged;
        continue;
      }
    }
    result.push(mark);
  }

  return result;
}

export function rangeHasAttr(marks: readonly FormattingMark[], range: BufferRange, attr: "bold" | "italic" | "underline"): boolean {
  if (range.isEmpty) return false;

  const covered: Array<[number, number]> = [];
  
  for (const mark of marks) {
    const attrValue = attr === "bold" ? mark.attrs.bold : attr === "italic" ? mark.attrs.italic : mark.attrs.underline;
    if (attrValue === true) {
      const intersection = mark.range.intersection(range);
      if (intersection) {
        covered.push([intersection.start, intersection.end]);
      }
    }
  }

  if (covered.length === 0) return false;

  covered.sort((a, b) => a[0] - b[0]);

  let pos = range.start;
  for (const [start, end] of covered) {
    if (start > pos) return false;
    pos = Math.max(pos, end);
  }

  return pos >= range.end;
}

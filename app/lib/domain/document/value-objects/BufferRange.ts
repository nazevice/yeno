export interface BufferRangeData {
  readonly start: number;
  readonly end: number;
}

export class BufferRange implements BufferRangeData {
  readonly start: number;
  readonly end: number;

  constructor(start: number, end: number) {
    if (start < 0) {
      throw new Error(`BufferRange start must be non-negative, got: ${start}`);
    }
    if (end < start) {
      throw new Error(`BufferRange end (${end}) must be >= start (${start})`);
    }
    this.start = start;
    this.end = end;
  }

  get length(): number {
    return this.end - this.start;
  }

  get isEmpty(): boolean {
    return this.start === this.end;
  }

  contains(pos: number): boolean {
    return pos >= this.start && pos < this.end;
  }

  containsRange(other: BufferRange): boolean {
    return other.start >= this.start && other.end <= this.end;
  }

  overlaps(other: BufferRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  isBefore(other: BufferRange): boolean {
    return this.end <= other.start;
  }

  isAfter(other: BufferRange): boolean {
    return this.start >= other.end;
  }

  intersection(other: BufferRange): BufferRange | null {
    if (!this.overlaps(other)) {
      return null;
    }
    const start = Math.max(this.start, other.start);
    const end = Math.min(this.end, other.end);
    return new BufferRange(start, end);
  }

  shift(delta: number): BufferRange {
    if (delta === 0) return this;
    return new BufferRange(this.start + delta, this.end + delta);
  }

  extend(delta: number): BufferRange {
    if (delta === 0) return this;
    const newEnd = this.end + delta;
    if (newEnd < this.start) {
      throw new Error(`Cannot extend range to negative length: start=${this.start}, newEnd=${newEnd}`);
    }
    return new BufferRange(this.start, newEnd);
  }

  withStart(newStart: number): BufferRange {
    return new BufferRange(newStart, this.end);
  }

  withEnd(newEnd: number): BufferRange {
    return new BufferRange(this.start, newEnd);
  }

  equals(other: BufferRange): boolean {
    return this.start === other.start && this.end === other.end;
  }

  toJSON(): BufferRangeData {
    return { start: this.start, end: this.end };
  }

  static fromJSON(data: BufferRangeData): BufferRange {
    return new BufferRange(data.start, data.end);
  }

  static empty(position: number = 0): BufferRange {
    return new BufferRange(position, position);
  }
}

export type { BufferRangeData as BufferRangeSnapshot };

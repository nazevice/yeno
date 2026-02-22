export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface SectionLayoutData {
  readonly margins?: Margins | undefined;
  readonly orientation?: "portrait" | "landscape" | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly footers?: Readonly<Record<string, string>> | undefined;
}

export class SectionLayout {
  readonly margins: Margins | undefined;
  readonly orientation: "portrait" | "landscape" | undefined;
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly footers: Readonly<Record<string, string>> | undefined;

  private constructor(
    margins: Margins | undefined,
    orientation: "portrait" | "landscape" | undefined,
    headers: Readonly<Record<string, string>> | undefined,
    footers: Readonly<Record<string, string>> | undefined
  ) {
    this.margins = margins;
    this.orientation = orientation;
    this.headers = headers;
    this.footers = footers;
  }

  static readonly default: SectionLayout = new SectionLayout(
    { top: 72, right: 72, bottom: 72, left: 72 },
    "portrait",
    undefined,
    undefined
  );

  static from(data: SectionLayoutData): SectionLayout {
    return new SectionLayout(data.margins, data.orientation, data.headers, data.footers);
  }

  withMargins(margins: Margins): SectionLayout {
    return new SectionLayout(margins, this.orientation, this.headers, this.footers);
  }

  withOrientation(orientation: "portrait" | "landscape"): SectionLayout {
    if (orientation === this.orientation) return this;
    return new SectionLayout(this.margins, orientation, this.headers, this.footers);
  }

  withHeaders(headers: Record<string, string>): SectionLayout {
    return new SectionLayout(this.margins, this.orientation, headers, this.footers);
  }

  withFooters(footers: Record<string, string>): SectionLayout {
    return new SectionLayout(this.margins, this.orientation, this.headers, footers);
  }

  equals(other: SectionLayout): boolean {
    return (
      marginsEqual(this.margins, other.margins) &&
      this.orientation === other.orientation &&
      recordsEqual(this.headers, other.headers) &&
      recordsEqual(this.footers, other.footers)
    );
  }

  toJSON(): SectionLayoutData {
    const result: { margins?: Margins; orientation?: "portrait" | "landscape"; headers?: Readonly<Record<string, string>>; footers?: Readonly<Record<string, string>> } = {};
    if (this.margins !== undefined) result.margins = { ...this.margins };
    if (this.orientation !== undefined) result.orientation = this.orientation;
    if (this.headers !== undefined) result.headers = { ...this.headers };
    if (this.footers !== undefined) result.footers = { ...this.footers };
    return result as SectionLayoutData;
  }

  static fromJSON(data: SectionLayoutData): SectionLayout {
    return SectionLayout.from(data);
  }
}

function marginsEqual(a?: Margins, b?: Margins): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function recordsEqual(a?: Readonly<Record<string, string>>, b?: Readonly<Record<string, string>>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export type { SectionLayoutData as SectionLayoutSnapshot };

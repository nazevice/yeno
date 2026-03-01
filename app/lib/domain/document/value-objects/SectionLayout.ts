export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export interface HeaderFooterContent {
  readonly left?: string;
  readonly center?: string;
  readonly right?: string;
}

export interface SectionLayoutData {
  readonly margins?: Margins | undefined;
  readonly orientation?: "portrait" | "landscape" | undefined;
  readonly pageSize?: PageSize | undefined;
  readonly columns?: number | undefined;
  readonly columnGap?: number | undefined;
  readonly header?: HeaderFooterContent | undefined;
  readonly footer?: HeaderFooterContent | undefined;
}

export class SectionLayout {
  readonly margins: Margins | undefined;
  readonly orientation: "portrait" | "landscape" | undefined;
  readonly pageSize: PageSize | undefined;
  readonly columns: number | undefined;
  readonly columnGap: number | undefined;
  readonly header: HeaderFooterContent | undefined;
  readonly footer: HeaderFooterContent | undefined;

  private constructor(
    margins: Margins | undefined,
    orientation: "portrait" | "landscape" | undefined,
    pageSize: PageSize | undefined,
    columns: number | undefined,
    columnGap: number | undefined,
    header: HeaderFooterContent | undefined,
    footer: HeaderFooterContent | undefined,
  ) {
    this.margins = margins;
    this.orientation = orientation;
    this.pageSize = pageSize;
    this.columns = columns;
    this.columnGap = columnGap;
    this.header = header;
    this.footer = footer;
  }

  static readonly default: SectionLayout = new SectionLayout(
    { top: 72, right: 72, bottom: 72, left: 72 },
    "portrait",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );

  static from(data: SectionLayoutData): SectionLayout {
    return new SectionLayout(
      data.margins,
      data.orientation,
      data.pageSize,
      data.columns,
      data.columnGap,
      data.header,
      data.footer,
    );
  }

  static resolveTemplate(text: string, pageNumber: number, totalPages: number): string {
    return text
      .replace(/{page}/gi, String(pageNumber))
      .replace(/{total}/gi, String(totalPages));
  }

  withMargins(margins: Margins): SectionLayout {
    return new SectionLayout(
      margins,
      this.orientation,
      this.pageSize,
      this.columns,
      this.columnGap,
      this.header,
      this.footer,
    );
  }

  withOrientation(orientation: "portrait" | "landscape"): SectionLayout {
    if (this.orientation === orientation) return this;
    return new SectionLayout(
      this.margins,
      orientation,
      this.pageSize,
      this.columns,
      this.columnGap,
      this.header,
      this.footer,
    );
  }

  withPageSize(pageSize: PageSize | undefined): SectionLayout {
    return new SectionLayout(
      this.margins,
      this.orientation,
      pageSize,
      this.columns,
      this.columnGap,
      this.header,
      this.footer,
    );
  }

  withColumns(columns: number | undefined): SectionLayout {
    return new SectionLayout(
      this.margins,
      this.orientation,
      this.pageSize,
      columns,
      this.columnGap,
      this.header,
      this.footer,
    );
  }

  withColumnGap(columnGap: number | undefined): SectionLayout {
    return new SectionLayout(
      this.margins,
      this.orientation,
      this.pageSize,
      this.columns,
      columnGap,
      this.header,
      this.footer,
    );
  }

  withHeader(header: HeaderFooterContent | undefined): SectionLayout {
    return new SectionLayout(
      this.margins,
      this.orientation,
      this.pageSize,
      this.columns,
      this.columnGap,
      header,
      this.footer,
    );
  }

  withFooter(footer: HeaderFooterContent | undefined): SectionLayout {
    return new SectionLayout(
      this.margins,
      this.orientation,
      this.pageSize,
      this.columns,
      this.columnGap,
      this.header,
      footer,
    );
  }

  equals(other: SectionLayout): boolean {
    return (
      marginsEqual(this.margins, other.margins) &&
      this.orientation === other.orientation &&
      pageSizeEqual(this.pageSize, other.pageSize) &&
      this.columns === other.columns &&
      this.columnGap === other.columnGap &&
      headerFooterEqual(this.header, other.header) &&
      headerFooterEqual(this.footer, other.footer)
    );
  }

  toJSON(): SectionLayoutData {
    const result: {
      margins?: Margins;
      orientation?: "portrait" | "landscape";
      pageSize?: PageSize;
      columns?: number;
      columnGap?: number;
      header?: HeaderFooterContent;
      footer?: HeaderFooterContent;
    } = {};
    if (this.margins !== undefined) result.margins = { ...this.margins };
    if (this.orientation !== undefined) result.orientation = this.orientation;
    if (this.pageSize !== undefined) result.pageSize = { ...this.pageSize };
    if (this.columns !== undefined) result.columns = this.columns;
    if (this.columnGap !== undefined) result.columnGap = this.columnGap;
    if (this.header !== undefined) result.header = { ...this.header };
    if (this.footer !== undefined) result.footer = { ...this.footer };
    return result;
  }

  static fromJSON(data: SectionLayoutData): SectionLayout {
    return SectionLayout.from(data);
  }
}

function pageSizeEqual(a?: PageSize, b?: PageSize): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.width === b.width && a.height === b.height;
}

function marginsEqual(a?: Margins, b?: Margins): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function headerFooterEqual(a?: HeaderFooterContent, b?: HeaderFooterContent): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.center === b.center && a.right === b.right;
}

export type { SectionLayoutData as SectionLayoutSnapshot };

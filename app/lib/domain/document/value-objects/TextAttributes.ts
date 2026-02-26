export interface TextAttributesData {
  readonly bold?: boolean | undefined;
  readonly italic?: boolean | undefined;
  readonly underline?: boolean | undefined;
  readonly font?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly href?: string | undefined;
  readonly color?: string | undefined;
}

export class TextAttributes {
  readonly bold: boolean | undefined;
  readonly italic: boolean | undefined;
  readonly underline: boolean | undefined;
  readonly font: string | undefined;
  readonly fontSize: number | undefined;
  readonly href: string | undefined;
  readonly color: string | undefined;

  private constructor(
    bold: boolean | undefined,
    italic: boolean | undefined,
    underline: boolean | undefined,
    font: string | undefined,
    fontSize: number | undefined,
    href: string | undefined,
    color: string | undefined
  ) {
    this.bold = bold;
    this.italic = italic;
    this.underline = underline;
    this.font = font;
    this.fontSize = fontSize;
    this.href = href;
    this.color = color;
  }

  static readonly empty: TextAttributes = new TextAttributes(undefined, undefined, undefined, undefined, undefined, undefined, undefined);

  static from(data: TextAttributesData): TextAttributes {
    if (!data.bold && !data.italic && !data.underline && !data.font && data.fontSize === undefined && !data.href && !data.color) {
      return TextAttributes.empty;
    }
    return new TextAttributes(data.bold, data.italic, data.underline, data.font, data.fontSize, data.href, data.color);
  }

  withBold(value: boolean | undefined): TextAttributes {
    if (value === this.bold) return this;
    return new TextAttributes(value, this.italic, this.underline, this.font, this.fontSize, this.href, this.color);
  }

  withItalic(value: boolean | undefined): TextAttributes {
    if (value === this.italic) return this;
    return new TextAttributes(this.bold, value, this.underline, this.font, this.fontSize, this.href, this.color);
  }

  withUnderline(value: boolean | undefined): TextAttributes {
    if (value === this.underline) return this;
    return new TextAttributes(this.bold, this.italic, value, this.font, this.fontSize, this.href, this.color);
  }

  withFont(font: string | undefined): TextAttributes {
    if (font === this.font) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, font, this.fontSize, this.href, this.color);
  }

  withFontSize(size: number | undefined): TextAttributes {
    if (size === this.fontSize) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, this.font, size, this.href, this.color);
  }

  withHref(href: string | undefined): TextAttributes {
    if (href === this.href) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, this.font, this.fontSize, href, this.color);
  }

  withColor(color: string | undefined): TextAttributes {
    if (color === this.color) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, this.font, this.fontSize, this.href, color);
  }

  removeLink(): TextAttributes {
    if (this.href === undefined) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, this.font, this.fontSize, undefined, this.color);
  }

  removeColor(): TextAttributes {
    if (this.color === undefined) return this;
    return new TextAttributes(this.bold, this.italic, this.underline, this.font, this.fontSize, this.href, undefined);
  }

  toggleBold(): TextAttributes {
    return this.withBold(!this.bold);
  }

  toggleItalic(): TextAttributes {
    return this.withItalic(!this.italic);
  }

  toggleUnderline(): TextAttributes {
    return this.withUnderline(!this.underline);
  }

  merge(other: TextAttributes): TextAttributes {
    return new TextAttributes(
      other.bold ?? this.bold,
      other.italic ?? this.italic,
      other.underline ?? this.underline,
      other.font ?? this.font,
      other.fontSize ?? this.fontSize,
      other.href ?? this.href,
      other.color ?? this.color
    );
  }

  hasAny(): boolean {
    return this.bold === true || this.italic === true || this.underline === true || this.font !== undefined || this.fontSize !== undefined || this.href !== undefined || this.color !== undefined;
  }

  equals(other: TextAttributes): boolean {
    return (
      this.bold === other.bold &&
      this.italic === other.italic &&
      this.underline === other.underline &&
      this.font === other.font &&
      this.fontSize === other.fontSize &&
      this.href === other.href &&
      this.color === other.color
    );
  }

  toJSON(): TextAttributesData {
    const result: { bold?: boolean; italic?: boolean; underline?: boolean; font?: string; fontSize?: number; href?: string; color?: string } = {};
    if (this.bold !== undefined) result.bold = this.bold;
    if (this.italic !== undefined) result.italic = this.italic;
    if (this.underline !== undefined) result.underline = this.underline;
    if (this.font !== undefined) result.font = this.font;
    if (this.fontSize !== undefined) result.fontSize = this.fontSize;
    if (this.href !== undefined) result.href = this.href;
    if (this.color !== undefined) result.color = this.color;
    return result as TextAttributesData;
  }

  static fromJSON(data: TextAttributesData): TextAttributes {
    return TextAttributes.from(data);
  }
}

export type { TextAttributesData as TextAttributesSnapshot };

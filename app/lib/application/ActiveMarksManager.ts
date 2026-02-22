import { TextAttributes } from "../domain/document/value-objects/TextAttributes";

export class ActiveMarksManager {
  private _marks: TextAttributes | null = null;

  get marks(): TextAttributes | null {
    return this._marks;
  }

  setMarks(marks: TextAttributes | null): void {
    this._marks = marks;
  }

  toggleBold(): void {
    this._marks = this._marks?.toggleBold() ?? TextAttributes.from({ bold: true });
  }

  toggleItalic(): void {
    this._marks = this._marks?.toggleItalic() ?? TextAttributes.from({ italic: true });
  }

  setFont(font: string): void {
    this._marks = (this._marks ?? TextAttributes.empty).withFont(font);
  }

  setFontSize(size: number): void {
    this._marks = (this._marks ?? TextAttributes.empty).withFontSize(size);
  }

  clear(): void {
    this._marks = null;
  }
}

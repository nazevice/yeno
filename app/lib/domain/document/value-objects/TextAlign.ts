export type TextAlign = "left" | "center" | "right" | "justify";

export namespace TextAlign {
  export const DEFAULT: TextAlign = "left";

  export function isValid(value: string): value is TextAlign {
    return value === "left" || value === "center" || value === "right" || value === "justify";
  }
}

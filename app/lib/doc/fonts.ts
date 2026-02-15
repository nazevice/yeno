export const DEFAULT_FONT = "Inter";

export const DEFAULT_FONT_SIZE = "16px";

export const FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48] as const;

export const FONT_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "default", label: "Default" },
  ...FONT_SIZE_PRESETS.map((px) => ({ value: `${px}px`, label: `${px}px` })),
  { value: "custom", label: "Custom" },
];

const FONT_SIZE_MIN_PX = 8;
const FONT_SIZE_MAX_PX = 96;

export function parseFontSizePx(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < FONT_SIZE_MIN_PX || parsed > FONT_SIZE_MAX_PX) {
    return null;
  }
  return parsed;
}

export function clampFontSizePx(px: number): number {
  return Math.max(FONT_SIZE_MIN_PX, Math.min(FONT_SIZE_MAX_PX, Math.round(px)));
}

export function normalizeFontSizeToPx(value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const pxMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*px$/i);
  if (pxMatch) {
    const num = Number.parseFloat(pxMatch[1]!);
    return `${clampFontSizePx(num)}px`;
  }

  const numOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (numOnly) {
    return `${clampFontSizePx(Number.parseFloat(numOnly[1]!))}px`;
  }

  const remMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*rem$/i);
  if (remMatch) {
    const rem = Number.parseFloat(remMatch[1]!);
    const px = rem * 16;
    return `${clampFontSizePx(px)}px`;
  }

  const emMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*em$/i);
  if (emMatch) {
    const em = Number.parseFloat(emMatch[1]!);
    const px = em * 16;
    return `${clampFontSizePx(px)}px`;
  }

  return null;
}

export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "Inter", label: "Inter" },
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "Arial", label: "Arial" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Verdana", label: "Verdana" },
  { value: "system-ui", label: "System UI" },
];

import { useEffect, useRef } from "react";

const PRESET_COLORS = [
  "#000000",
  "#374151",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#db2777",
];

const RECENT_COLORS_KEY = "yeno-recent-colors";
const MAX_RECENT_COLORS = 6;

interface ColorPaletteProps {
  isOpen: boolean;
  currentColor: string | null;
  onSelectColor: (color: string | undefined) => void;
  onClose: () => void;
}

function getRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return [];
}

function addRecentColor(color: string): void {
  try {
    const recent = getRecentColors().filter((c) => c !== color);
    const updated = [color, ...recent].slice(0, MAX_RECENT_COLORS);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore errors
  }
}

export function ColorPalette({
  isOpen,
  currentColor,
  onSelectColor,
  onClose,
}: ColorPaletteProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const recentColors = getRecentColors();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleColorSelect = (color: string) => {
    addRecentColor(color);
    onSelectColor(color);
  };

  const handleDefaultSelect = () => {
    onSelectColor(undefined);
  };

  return (
    <div
      ref={dialogRef}
      className="absolute z-50 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
      style={{ top: "100%", left: 0 }}
    >
      <div className="mb-2 text-xs font-medium text-zinc-500">Colors</div>
      <div className="grid grid-cols-7 gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => handleColorSelect(color)}
            className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${
              currentColor === color ? "border-zinc-900" : "border-transparent"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {recentColors.length > 0 && (
        <>
          <div className="mb-1.5 mt-3 text-xs font-medium text-zinc-500">Recent</div>
          <div className="grid grid-cols-7 gap-1.5">
            {recentColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorSelect(color)}
                className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${
                  currentColor === color ? "border-zinc-900" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-3 border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={handleDefaultSelect}
          className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          Default (Black)
        </button>
      </div>
    </div>
  );
}

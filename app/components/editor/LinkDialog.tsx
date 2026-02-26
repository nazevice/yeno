import { useEffect, useRef, useState } from "react";

interface LinkDialogProps {
  isOpen: boolean;
  initialUrl?: string;
  onConfirm: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function LinkDialog({
  isOpen,
  initialUrl = "",
  onConfirm,
  onRemove,
  onClose,
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isOpen, initialUrl]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onConfirm(url.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (url.trim()) {
        onConfirm(url.trim());
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="absolute z-50 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
      style={{ top: "100%", left: 0 }}
    >
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com or email@example.com"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            disabled={!url.trim()}
            className="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {initialUrl ? "Update" : "Insert"}
          </button>
          {initialUrl && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

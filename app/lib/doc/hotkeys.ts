export const TOGGLE_MODE_SHORTCUT = "Ctrl+P";

export function bindToggleModeShortcut(onToggle: () => void): () => void {
  const handler = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
      event.preventDefault();
      onToggle();
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

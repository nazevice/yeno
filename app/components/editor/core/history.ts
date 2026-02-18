const MAX_HISTORY_SIZE = 50;

export interface HistoryEntry {
  html: string;
  selection: { anchorOffset: number; focusOffset: number } | null;
}

export interface HistoryStack {
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  push: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function createHistoryStack(
  getCurrentState: () => { html: string; selection: { anchorOffset: number; focusOffset: number } | null },
  applyState: (entry: HistoryEntry) => void,
): HistoryStack {
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];

  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    undo: () => {
      if (past.length === 0) return null;
      const current = getCurrentState();
      future.unshift({ html: current.html, selection: current.selection });
      const entry = past.pop()!;
      applyState(entry);
      return entry;
    },
    redo: () => {
      if (future.length === 0) return null;
      const current = getCurrentState();
      past.push({ html: current.html, selection: current.selection });
      const entry = future.shift()!;
      applyState(entry);
      return entry;
    },
    push: () => {
      future.length = 0;
      const current = getCurrentState();
      if (past.length > 0 && past[past.length - 1]!.html === current.html) return;
      past.push({ html: current.html, selection: current.selection });
      if (past.length > MAX_HISTORY_SIZE) past.shift();
    },
    clear: () => {
      past.length = 0;
      future.length = 0;
    },
  };
}

import type { DocumentSnapshot } from "../domain/document/DocumentSnapshot";
import type { Selection } from "./SelectionManager";

export interface HistoryEntry {
  snapshot: DocumentSnapshot;
  selection: Selection | null;
}

export class HistoryManager {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(entry: HistoryEntry): void {
    this.future = [];
    this.past.push(entry);
    if (this.past.length > this.maxSize) {
      this.past.shift();
    }
  }

  undo(currentEntry: HistoryEntry): HistoryEntry | null {
    if (this.past.length === 0) return null;
    
    this.future.push(currentEntry);
    
    const previousEntry = this.past.pop()!;
    return previousEntry;
  }

  redo(currentEntry: HistoryEntry): HistoryEntry | null {
    if (this.future.length === 0) return null;

    this.past.push(currentEntry);

    const nextEntry = this.future.pop()!;
    return nextEntry;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

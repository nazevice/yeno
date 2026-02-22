import type { DocumentEvents } from "../domain/document/events/index";
import type { Selection } from "./SelectionManager";

export interface HistoryEntry {
  inverseEvent: DocumentEvents;
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

  undo(): HistoryEntry | null {
    if (this.past.length === 0) return null;
    const entry = this.past.pop()!;
    this.future.push(entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    if (this.future.length === 0) return null;
    const entry = this.future.pop()!;
    this.past.push(entry);
    return entry;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

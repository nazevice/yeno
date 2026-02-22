import type { BlockId } from "../domain/shared/NodeId";

export interface SelectionPoint {
  blockId: BlockId;
  offset: number;
}

export interface Selection {
  anchor: SelectionPoint;
  focus: SelectionPoint;
}

export class SelectionManager {
  private _selection: Selection | null = null;

  get selection(): Selection | null {
    return this._selection;
  }

  setSelection(selection: Selection | null): void {
    this._selection = selection;
  }

  get isCollapsed(): boolean {
    if (!this._selection) return true;
    return (
      this._selection.anchor.blockId === this._selection.focus.blockId &&
      this._selection.anchor.offset === this._selection.focus.offset
    );
  }

  getStartPoint(): SelectionPoint | null {
    if (!this._selection) return null;
    
    if (this._selection.anchor.blockId === this._selection.focus.blockId) {
      return this._selection.anchor.offset <= this._selection.focus.offset
        ? this._selection.anchor
        : this._selection.focus;
    }
    
    return this._selection.anchor;
  }

  getEndPoint(): SelectionPoint | null {
    if (!this._selection) return null;
    
    if (this._selection.anchor.blockId === this._selection.focus.blockId) {
      return this._selection.anchor.offset >= this._selection.focus.offset
        ? this._selection.anchor
        : this._selection.focus;
    }
    
    return this._selection.focus;
  }

  collapseToStart(): void {
    if (!this._selection) return;
    const start = this.getStartPoint();
    if (start) {
      this._selection = { anchor: start, focus: start };
    }
  }

  collapseToEnd(): void {
    if (!this._selection) return;
    const end = this.getEndPoint();
    if (end) {
      this._selection = { anchor: end, focus: end };
    }
  }
}

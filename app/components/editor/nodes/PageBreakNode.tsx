import type { DOMConversionMap, NodeKey, SerializedElementNode, SerializedLexicalNode } from "lexical";
import { $applyNodeReplacement, ElementNode } from "lexical";

export type SerializedPageBreakNode = SerializedLexicalNode & {
  type: "yeno-page-break";
  version: 1;
};

export class PageBreakNode extends ElementNode {
  constructor(key?: NodeKey) {
    super(key);
  }

  static getType(): "yeno-page-break" {
    return "yeno-page-break";
  }

  static clone(node: PageBreakNode): PageBreakNode {
    return new PageBreakNode(node.__key);
  }

  createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "page-break-node";
    dom.setAttribute("data-lexical-page-break", "true");
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return "";
  }

  isInline(): boolean {
    return false;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  static importJSON(_serialized: SerializedPageBreakNode): PageBreakNode {
    return $createPageBreakNode();
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: "yeno-page-break",
      version: 1,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }
}

export function $createPageBreakNode(): PageBreakNode {
  return $applyNodeReplacement(new PageBreakNode());
}

export function $isPageBreakNode(node: unknown): node is PageBreakNode {
  return node instanceof PageBreakNode;
}

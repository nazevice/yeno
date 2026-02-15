import type { DOMConversionMap, EditorConfig, LexicalEditor, NodeKey } from "lexical";
import { $applyNodeReplacement, DecoratorNode } from "lexical";

import { toImageToken } from "~/lib/doc/imageToken";
import { ImageComponent } from "./ImageComponent";

export interface ImagePayload {
  assetName: string;
  alt: string;
}

export type SerializedImageNode = {
  assetName: string;
  alt: string;
  type: "yeno-image";
  version: 1;
};

export class ImageNode extends DecoratorNode<React.ReactNode> {
  __assetName: string;
  __alt: string;

  constructor(assetName: string, alt: string, key?: NodeKey) {
    super(key);
    this.__assetName = assetName;
    this.__alt = alt;
  }

  static getType(): "yeno-image" {
    return "yeno-image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__assetName, node.__alt, node.__key);
  }

  getTextContent(): string {
    return toImageToken(this.__assetName, this.__alt);
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactNode {
    return <ImageComponent assetName={this.__assetName} alt={this.__alt} />;
  }

  isInline(): boolean {
    return false;
  }

  isIsolated(): boolean {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    return $createImageNode({
      assetName: serialized.assetName,
      alt: serialized.alt,
    });
  }

  exportJSON(): SerializedImageNode {
    return {
      assetName: this.__assetName,
      alt: this.__alt,
      type: "yeno-image",
      version: 1,
    };
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }
}

export function $createImageNode(payload: ImagePayload): ImageNode {
  return $applyNodeReplacement(new ImageNode(payload.assetName, payload.alt));
}

export function $isImageNode(node: unknown): node is ImageNode {
  return node instanceof ImageNode;
}

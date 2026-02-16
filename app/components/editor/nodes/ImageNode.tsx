import type { DOMConversionMap, EditorConfig, LexicalEditor, NodeKey } from "lexical";
import { $applyNodeReplacement, DecoratorNode } from "lexical";

import { toImageToken } from "~/lib/doc/imageToken";
import { ImageComponent } from "./ImageComponent";

export interface ImagePayload {
  assetName: string;
  alt: string;
  width?: number;
  height?: number;
}

export type SerializedImageNode = {
  assetName: string;
  alt: string;
  width?: number;
  height?: number;
  type: "yeno-image";
  version: 1 | 2;
};

export class ImageNode extends DecoratorNode<React.ReactNode> {
  __assetName: string;
  __alt: string;
  __width?: number;
  __height?: number;

  constructor(
    assetName: string,
    alt: string,
    key?: NodeKey,
    width?: number,
    height?: number,
  ) {
    super(key);
    this.__assetName = assetName;
    this.__alt = alt;
    this.__width = width;
    this.__height = height;
  }

  static getType(): "yeno-image" {
    return "yeno-image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__assetName,
      node.__alt,
      node.__key,
      node.__width,
      node.__height,
    );
  }

  setWidthAndHeight(width: number, height: number): this {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
    return writable;
  }

  getTextContent(): string {
    return toImageToken(
      this.__assetName,
      this.__alt,
      this.__width,
      this.__height,
    );
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): React.ReactNode {
    return (
      <ImageComponent
        nodeKey={this.getKey()}
        assetName={this.__assetName}
        alt={this.__alt}
        width={this.__width}
        height={this.__height}
      />
    );
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
      width: serialized.version === 2 ? serialized.width : undefined,
      height: serialized.version === 2 ? serialized.height : undefined,
    });
  }

  exportJSON(): SerializedImageNode {
    return {
      assetName: this.__assetName,
      alt: this.__alt,
      width: this.__width,
      height: this.__height,
      type: "yeno-image",
      version: 2,
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
  return $applyNodeReplacement(
    new ImageNode(
      payload.assetName,
      payload.alt,
      undefined,
      payload.width,
      payload.height,
    ),
  );
}

export function $isImageNode(node: unknown): node is ImageNode {
  return node instanceof ImageNode;
}

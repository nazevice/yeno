import type { BlockBase } from "./Block";
import type { BlockId } from "../../shared/NodeId";

export interface AssetRef {
  readonly name: string;
  readonly targetPos: number;
  readonly alt: string;
  readonly size: readonly [number, number];
  readonly bytes: readonly number[];
}

export interface Image extends BlockBase {
  readonly type: "image";
  readonly bufferPosition: number;
  readonly assetRef: AssetRef;
  readonly alt: string;
  readonly size: readonly [number, number];
}

export namespace Image {
  export function create(
    id: BlockBase["id"],
    bufferPosition: number,
    assetRef: AssetRef,
    alt: string,
    size: readonly [number, number]
  ): Image {
    return {
      id,
      type: "image",
      bufferPosition,
      assetRef,
      alt,
      size,
    };
  }

  export function withBufferPosition(image: Image, bufferPosition: number): Image {
    return { ...image, bufferPosition };
  }

  export function withSize(image: Image, size: readonly [number, number]): Image {
    return { ...image, size };
  }
}

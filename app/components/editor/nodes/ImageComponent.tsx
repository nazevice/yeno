import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMAND_PRIORITY_LOW, CLICK_COMMAND } from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useAssets, resolveAssetDataUrl } from "../AssetsContext";
import { $getNodeByKey } from "lexical";
import { $isImageNode } from "./ImageNode";

const MIN_SIZE = 32;
const MAX_SIZE = 2000;

type HandlePosition = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ImageComponentProps {
  nodeKey: string;
  assetName: string;
  alt: string;
  width?: number;
  height?: number;
}

function ResizeHandle({
  position,
  onResizeStart,
}: {
  position: HandlePosition;
  onResizeStart: (e: React.MouseEvent, position: HandlePosition) => void;
}) {
  const cursorMap: Record<HandlePosition, string> = {
    n: "n-resize",
    s: "s-resize",
    e: "e-resize",
    w: "w-resize",
    ne: "ne-resize",
    nw: "nw-resize",
    se: "se-resize",
    sw: "sw-resize",
  };
  const posMap: Record<HandlePosition, string> = {
    n: "top-1 left-1/2 -translate-x-1/2",
    s: "bottom-1 left-1/2 -translate-x-1/2",
    e: "right-1 top-1/2 -translate-y-1/2",
    w: "left-1 top-1/2 -translate-y-1/2",
    ne: "top-1 right-1",
    nw: "top-1 left-1",
    se: "bottom-1 right-1",
    sw: "bottom-1 left-1",
  };
  return (
    <div
      className={`absolute h-2 w-2 rounded-full border-2 border-purple-600 bg-white ${posMap[position]}`}
      style={{ cursor: cursorMap[position] }}
      data-resize-handle={position}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onResizeStart(e, position);
      }}
    />
  );
}

export function ImageComponent({
  nodeKey,
  assetName,
  alt,
  width,
  height,
}: ImageComponentProps) {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [previewSize, setPreviewSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null);

  const assetsContext = useAssets();
  const dataUrl = useMemo(() => {
    const fromContext = assetsContext.resolveDataUrl(assetName);
    if (fromContext) return fromContext;
    return resolveAssetDataUrl(assetName);
  }, [assetsContext.resolveDataUrl, assetsContext.assets, assetName]);
  const displayAlt = alt || assetName || "Image";

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, position: HandlePosition) => {
      const img = imgRef.current;
      if (!img || !editor) return;
      const initialX = e.clientX;
      const initialY = e.clientY;
      const rect = img.getBoundingClientRect();
      const initialW =
        width ?? (Math.round(rect.width) || img.naturalWidth || 400);
      const initialH =
        height ?? (Math.round(rect.height) || img.naturalHeight || 300);
      const aspectRatio = initialW / initialH;
      const clamp = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, v));

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - initialX;
        const dy = moveEvent.clientY - initialY;
        let newW = initialW;
        let newH = initialH;
        const isCorner =
          position === "ne" ||
          position === "nw" ||
          position === "se" ||
          position === "sw";

        if (isCorner) {
          const isE = position.includes("e");
          const isW = position.includes("w");
          const isN = position.includes("n");
          const isS = position.includes("s");
          const deltaW = isE ? dx : isW ? -dx : 0;
          const deltaH = isS ? dy : isN ? -dy : 0;
          const scaleW = (initialW + deltaW) / initialW;
          const scaleH = (initialH + deltaH) / initialH;
          const scale =
            Math.abs(deltaW) / initialW >= Math.abs(deltaH) / initialH
              ? scaleW
              : scaleH;
          newW = clamp(initialW * scale);
          newH = clamp(newW / aspectRatio);
        } else {
          if (position === "e" || position === "w") {
            newW =
              position === "e"
                ? clamp(initialW + dx)
                : clamp(initialW - dx);
            newH = initialH;
          } else {
            newW = initialW;
            newH =
              position === "s"
                ? clamp(initialH + dy)
                : clamp(initialH - dy);
          }
        }

        newW = Math.round(newW);
        newH = Math.round(newH);

        lastSizeRef.current = { w: newW, h: newH };
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setPreviewSize(lastSizeRef.current);
        });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;

        const final = lastSizeRef.current ?? { w: initialW, h: initialH };
        lastSizeRef.current = null;
        setPreviewSize(null);

        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isImageNode(node)) {
            node.setWidthAndHeight(
              Math.round(final.w),
              Math.round(final.h),
            );
          }
        });
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp, { once: true });
    },
    [editor, nodeKey, width, height],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          const element = editor.getElementByKey(nodeKey);
          if (!element) return false;
          const target = event.target as Node;
          if (!element.contains(target)) return false;
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) {
            clearSelection();
          } else {
            setSelected(true);
          }
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, nodeKey, setSelected, clearSelection]);

  if (!dataUrl) {
    return (
      <span
        className="my-2 flex min-h-[80px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-500"
        title={`Asset: ${assetName}`}
      >
        Image: {displayAlt}
      </span>
    );
  }

  const handleHandles: HandlePosition[] = [
    "n",
    "s",
    "e",
    "w",
    "ne",
    "nw",
    "se",
    "sw",
  ];

  const displayW = previewSize?.w ?? width;
  const displayH = previewSize?.h ?? height;
  const imgStyle: React.CSSProperties = {};
  if (displayW != null) imgStyle.width = `${displayW}px`;
  if (displayH != null) imgStyle.height = `${displayH}px`;

  return (
    <div
      ref={wrapperRef}
      className="relative my-2 inline-block"
      data-testid="image-block"
      data-node-key={nodeKey}
    >
      <img
        ref={imgRef}
        src={dataUrl}
        alt={displayAlt}
        className={`rounded-lg ${
          displayW != null || displayH != null ? "" : "max-h-[400px] max-w-full"
        }`}
        style={imgStyle}
        loading="lazy"
        draggable={false}
      />
      {isSelected && (
        <>
          <div
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-purple-500"
            aria-hidden
          />
          {handleHandles.map((pos) => (
            <ResizeHandle
              key={pos}
              position={pos}
              onResizeStart={handleResizeStart}
            />
          ))}
        </>
      )}
    </div>
  );
}

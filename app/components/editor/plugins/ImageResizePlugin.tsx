import { useEffect, useRef } from "react";
import { useEditorContext } from "../core/EditorContext";
import { IMAGE_BLOCK_SELECTOR } from "../core/blockUtils";

const MIN_SIZE = 32;
const MAX_SIZE = 2000;
const HANDLE_SIZE = 8;

type HandlePosition = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const POSITION_STYLES: Record<HandlePosition, string> = {
  n: "top: 0; left: 50%; transform: translate(-50%, -50%);",
  s: "bottom: 0; left: 50%; transform: translate(-50%, 50%);",
  e: "top: 50%; right: 0; transform: translate(50%, -50%);",
  w: "top: 50%; left: 0; transform: translate(-50%, -50%);",
  ne: "top: 0; right: 0; transform: translate(50%, -50%);",
  nw: "top: 0; left: 0; transform: translate(-50%, -50%);",
  se: "bottom: 0; right: 0; transform: translate(50%, 50%);",
  sw: "bottom: 0; left: 0; transform: translate(-50%, 50%);",
};

const CURSOR_MAP: Record<HandlePosition, string> = {
  n: "n-resize",
  s: "s-resize",
  e: "e-resize",
  w: "w-resize",
  ne: "ne-resize",
  nw: "nw-resize",
  se: "se-resize",
  sw: "sw-resize",
};

function createResizeUI(block: HTMLElement): (() => void) | null {
  if (block.querySelector(".image-resize-frame")) return null;

  const img = block.querySelector("img");
  if (!img) return null;

  const clamp = (v: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, v));

  const frame = document.createElement("div");
  frame.className = "image-resize-frame";
  frame.setAttribute("data-testid", "image-resize-frame");
  frame.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 2px solid rgb(124, 58, 237);
    border-radius: 6px;
    box-sizing: border-box;
    z-index: 5;
  `;
  block.appendChild(frame);

  const handlesContainer = document.createElement("div");
  handlesContainer.className = "image-resize-handles";
  handlesContainer.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  `;

  const positions: HandlePosition[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  for (const pos of positions) {
    const handle = document.createElement("div");
    handle.className = "image-resize-handle";
    handle.setAttribute("data-position", pos);
    handle.setAttribute("data-testid", `image-resize-handle-${pos}`);
    handle.setAttribute("aria-label", `Resize from ${pos}`);
    handle.title = "Drag to resize";
    handle.style.cssText = `
      position: absolute;
      ${POSITION_STYLES[pos]}
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      cursor: ${CURSOR_MAP[pos]};
      pointer-events: auto;
      background: white;
      border: 2px solid rgb(124, 58, 237);
      border-radius: 50%;
      box-sizing: border-box;
    `;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const rect = img.getBoundingClientRect();
      const dataW = block.getAttribute("data-width");
      const dataH = block.getAttribute("data-height");
      const initialW = dataW ? Number.parseInt(dataW, 10) : Math.round(rect.width) || img.naturalWidth || 400;
      const initialH = dataH ? Number.parseInt(dataH, 10) : Math.round(rect.height) || img.naturalHeight || 300;
      const aspectRatio = initialW / initialH;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newW = initialW;
        let newH = initialH;
        const isCorner = pos === "ne" || pos === "nw" || pos === "se" || pos === "sw";
        const isEdgeH = pos === "e" || pos === "w";
        const isEdgeV = pos === "n" || pos === "s";

        if (isCorner) {
          const driveW = pos === "se" || pos === "ne" ? dx : -dx;
          newW = clamp(initialW + driveW);
          newH = Math.round(newW / aspectRatio);
        } else if (isEdgeH) {
          newW = clamp(pos === "e" ? initialW + dx : initialW - dx);
          newH = initialH;
        } else {
          newH = clamp(pos === "s" ? initialH + dy : initialH - dy);
          newW = initialW;
        }

        block.setAttribute("data-width", String(newW));
        block.setAttribute("data-height", String(newH));
        img.style.width = `${newW}px`;
        img.style.height = `${newH}px`;
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = CURSOR_MAP[pos];
      document.body.style.userSelect = "none";
    });

    handlesContainer.appendChild(handle);
  }
  block.appendChild(handlesContainer);

  return () => {
    frame.remove();
    handlesContainer.remove();
  };
}

function applyInitialDimensions(block: HTMLElement): void {
  const img = block.querySelector("img");
  if (!img) return;
  const w = block.getAttribute("data-width");
  const h = block.getAttribute("data-height");
  if (w != null && h != null) {
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
  }
}

export function ImageResizePlugin() {
  const { rootRef } = useEditorContext();
  const mountedRef = useRef<Set<HTMLElement>>(new Set());
  const teardownsRef = useRef<Map<HTMLElement, () => void>>(new Map());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scan = () => {
      const blocks = root.querySelectorAll<HTMLElement>(IMAGE_BLOCK_SELECTOR);
      for (const block of blocks) {
        applyInitialDimensions(block);
        if (!mountedRef.current.has(block)) {
          mountedRef.current.add(block);
          const teardown = createResizeUI(block);
          if (teardown) {
            teardownsRef.current.set(block, teardown);
          }
        }
      }
    };

    scan();
    window.addEventListener("image-resizer-scan", scan);

    const observer = new MutationObserver(() => {
      const blocks = root.querySelectorAll<HTMLElement>(IMAGE_BLOCK_SELECTOR);
      for (const block of blocks) {
        applyInitialDimensions(block);
        if (!mountedRef.current.has(block)) {
          mountedRef.current.add(block);
          const teardown = createResizeUI(block);
          if (teardown) {
            teardownsRef.current.set(block, teardown);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-type"] });

    return () => {
      window.removeEventListener("image-resizer-scan", scan);
      observer.disconnect();
      for (const teardown of teardownsRef.current.values()) {
        teardown();
      }
      teardownsRef.current.clear();
      mountedRef.current.clear();
    };
  }, [rootRef]);

  return null;
}

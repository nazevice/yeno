import { useEffect, useRef } from "react";
import { useEditorContext } from "../core/EditorContext";
import { getPaginateableBlocks, createPageBreakElement } from "../core/blockUtils";

interface PaginationPluginProps {
  pageHeightPx: number;
  pageGapPx: number;
  enabled: boolean;
}

const ESTIMATED_LINE_HEIGHT_PX = 28;
const ESTIMATED_CHARS_PER_LINE = 85;
const SAFETY_BUFFER_PX = 16;

function getBlockHeightPx(block: HTMLElement): number {
  const rect = block.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const style = getComputedStyle(block);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return rect.height + marginTop + marginBottom;
}

/** Estimate block height when not yet laid out. Accounts for wrapped long lines. */
function estimateBlockHeight(block: HTMLElement): number {
  const text = block.innerText || block.textContent || "";
  const explicitLines = (text.match(/\n/g)?.length ?? 0) + 1;
  if (text.length > 0 && explicitLines === 1) {
    const wrappedLines = Math.max(1, Math.ceil(text.length / ESTIMATED_CHARS_PER_LINE));
    return wrappedLines * ESTIMATED_LINE_HEIGHT_PX;
  }
  return Math.max(1, explicitLines) * ESTIMATED_LINE_HEIGHT_PX;
}

function computePageBreaksBefore(
  root: HTMLElement,
  blocks: HTMLElement[],
  maxPageHeight: number,
  firstPageMaxHeight: number,
): Set<HTMLElement> {
  const measured = blocks.map((block) => {
    const h = getBlockHeightPx(block);
    if (h > 0) return { block, height: h };
    return { block, height: estimateBlockHeight(block) };
  });

  const needsBreakBefore = new Set<HTMLElement>();
  let currentHeight = 0;
  let isFirstPage = true;

  for (const { block, height: h } of measured) {
    if (h <= 0) continue;
    const maxForThisPage = isFirstPage ? firstPageMaxHeight : maxPageHeight;

    if (currentHeight + h > maxForThisPage) {
      needsBreakBefore.add(block);
      currentHeight = h;
      isFirstPage = false;
    } else {
      currentHeight += h;
    }
  }
  return needsBreakBefore;
}

function runReflow(root: HTMLElement, pageHeightPx: number): boolean {
  const style = getComputedStyle(root);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  /* First page: content starts after paddingTop, must end before page boundary at pageHeightPx.
   * Subsequent pages: full pageHeightPx. paddingBottom is at doc end, not per-page. */
  const firstPageMaxHeight = pageHeightPx - paddingTop - SAFETY_BUFFER_PX;
  const subsequentPageMaxHeight = pageHeightPx - SAFETY_BUFFER_PX;

  const blocks = getPaginateableBlocks(root);
  const desiredBreaksBefore = computePageBreaksBefore(
    root,
    blocks,
    subsequentPageMaxHeight,
    firstPageMaxHeight,
  );

  const currentBreaksBefore = new Set<HTMLElement>();
  const pageBreaksToRemove: HTMLElement[] = [];

  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i] as HTMLElement;
    if (child.getAttribute?.("data-type") === "page-break") {
      const next = root.children[i + 1] as HTMLElement | undefined;
      if (next && next.getAttribute?.("data-type") !== "page-break" && !desiredBreaksBefore.has(next)) {
        pageBreaksToRemove.push(child);
      }
      continue;
    }
    const prev = root.children[i - 1] as HTMLElement | undefined;
    if (prev?.getAttribute?.("data-type") === "page-break") {
      currentBreaksBefore.add(child);
    }
  }

  const hasBlocks = blocks.length > 0;
  const anyMeasured = blocks.some((b) => getBlockHeightPx(b) > 0);
  const needsAdd = [...desiredBreaksBefore].some((b) => !currentBreaksBefore.has(b));
  const needsRemove = [...currentBreaksBefore].some((b) => !desiredBreaksBefore.has(b));
  if (hasBlocks && !anyMeasured && !needsAdd && !needsRemove) {
    return false;
  }

  if (!needsAdd && !needsRemove) return true;

  for (const pb of pageBreaksToRemove) {
    pb.remove();
  }

  for (const block of desiredBreaksBefore) {
    if (currentBreaksBefore.has(block)) continue;
    const pageBreak = createPageBreakElement();
    root.insertBefore(pageBreak, block);
  }
  return true;
}

export function PaginationPlugin({ pageHeightPx, enabled }: PaginationPluginProps) {
  const { rootRef } = useEditorContext();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const scheduleReflow = (retryCount = 0) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const ok = runReflow(root, pageHeightPx);
            if (!ok && retryCount < 8) {
              setTimeout(() => scheduleReflow(retryCount + 1), 50 * (retryCount + 1));
            }
          });
        });
      });
    };

    const mutationObserver = new MutationObserver(() => {
      scheduleReflow();
    });
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      characterData: true,
    });

    const resizeObserver = new ResizeObserver(() => scheduleReflow());
    resizeObserver.observe(root);

    scheduleReflow();

    const onDelayedReflow = () => scheduleReflow();
    window.addEventListener("pagination-delayed-reflow", onDelayedReflow);

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pagination-delayed-reflow", onDelayedReflow);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rootRef, enabled, pageHeightPx]);

  return null;
}

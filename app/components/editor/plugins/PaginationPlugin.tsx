import { useEffect, useRef } from "react";
import { $getNodeByKey, $getRoot, type LexicalNode, type LexicalEditor } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { $createPageBreakNode, $isPageBreakNode } from "../nodes/PageBreakNode";

interface PaginationPluginProps {
  pageHeightPx: number;
  pageGapPx: number;
  enabled: boolean;
}

/** Returns block height including margins (getBoundingClientRect excludes margins). */
function getBlockHeightPx(editor: LexicalEditor, nodeKey: string): number {
  const el = editor.getElementByKey(nodeKey);
  if (!el || !(el instanceof HTMLElement)) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  const style = getComputedStyle(el);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return rect.height + marginTop + marginBottom;
}

/** Returns root-level blocks in document order. Treats List as single block (no ListItem splitting). */
function getPaginateableBlocks(root: ReturnType<typeof $getRoot>): { node: LexicalNode; key: string }[] {
  const blocks: { node: LexicalNode; key: string }[] = [];
  for (const child of root.getChildren()) {
    if ($isPageBreakNode(child)) continue;
    blocks.push({ node: child, key: child.getKey() });
  }
  return blocks;
}

/** Approximate px per line (line-height 1.75 * 16px base). Used when DOM measurement fails. */
const ESTIMATED_LINE_HEIGHT_PX = 28;

/** Keys of blocks that need a PageBreak inserted BEFORE them. */
function computePageBreaksBefore(
  editor: LexicalEditor,
  blocks: { node: LexicalNode; key: string }[],
  maxPageHeight: number,
  firstPageMaxHeight: number,
): Set<string> {
  const measured = blocks.map((b) => {
    const h = getBlockHeightPx(editor, b.key);
    if (h > 0) return { key: b.key, height: h };
    const text = b.node.getTextContent();
    const lines = Math.max(1, (text.match(/\n/g)?.length ?? 0) + 1);
    return { key: b.key, height: lines * ESTIMATED_LINE_HEIGHT_PX };
  });

  const needsBreakBefore = new Set<string>();
  let currentHeight = 0;
  let isFirstPage = true;

  for (const { key, height: h } of measured) {
    if (h <= 0) continue;
    const maxForThisPage = isFirstPage ? firstPageMaxHeight : maxPageHeight;

    if (currentHeight + h > maxForThisPage) {
      needsBreakBefore.add(key);
      currentHeight = h;
      isFirstPage = false;
    } else {
      currentHeight += h;
    }
  }
  return needsBreakBefore;
}

/** Extra space at bottom of each page to prevent text being cut by page boundary. */
const SAFETY_BUFFER_PX = 100;

/** Runs reflow: insert/remove PageBreakNodes to match desired layout. Returns true if DOM was ready for measurement. */
function runReflow(editor: LexicalEditor, pageHeightPx: number): boolean {
  const root = editor.getRootElement();
  if (!root) return false;

  const style = getComputedStyle(root);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const firstPageMaxHeight = pageHeightPx - paddingTop - paddingBottom - SAFETY_BUFFER_PX;
  const subsequentPageMaxHeight = pageHeightPx - SAFETY_BUFFER_PX;

  let desiredBreaksBefore: Set<string> = new Set();
  let currentBreaksBefore: Set<string> = new Set();
  let blocks: { node: LexicalNode; key: string }[] = [];

  editor.getEditorState().read(() => {
    const rootNode = $getRoot();
    blocks = getPaginateableBlocks(rootNode);
    desiredBreaksBefore = computePageBreaksBefore(
      editor,
      blocks,
      subsequentPageMaxHeight,
      firstPageMaxHeight,
    );

    const children = rootNode.getChildren();
    currentBreaksBefore = new Set<string>();
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if ($isPageBreakNode(node)) continue;
      const prev = children[i - 1];
      if (prev && $isPageBreakNode(prev)) {
        currentBreaksBefore.add(node.getKey());
      }
    }
  });

  /* DOM may not be ready yet. If we have blocks but all heights are 0 AND we have no breaks to add/remove, retry later. */
  const hasBlocks = blocks.length > 0;
  const anyMeasured = blocks.some((b) => getBlockHeightPx(editor, b.key) > 0);
  const needsAdd = [...desiredBreaksBefore].some((k) => !currentBreaksBefore.has(k));
  const needsRemove = [...currentBreaksBefore].some((k) => !desiredBreaksBefore.has(k));
  if (hasBlocks && !anyMeasured && !needsAdd && !needsRemove) {
    return false;
  }

  if (!needsAdd && !needsRemove) return true;

  editor.update(
    () => {
      const rootNode = $getRoot();
      const children = rootNode.getChildren();

      const currentBreaksBefore = new Set<string>();
      const pageBreaksToRemove: LexicalNode[] = [];

      let i = 0;
      while (i < children.length) {
        const node = children[i];
        if ($isPageBreakNode(node)) {
          const next = children[i + 1];
          const nextBlockKey = next && !$isPageBreakNode(next) ? next.getKey() : null;
          if (nextBlockKey && !desiredBreaksBefore.has(nextBlockKey)) {
            pageBreaksToRemove.push(node);
          }
          i++;
          continue;
        }
        const prev = children[i - 1];
        if (prev && $isPageBreakNode(prev)) {
          currentBreaksBefore.add(node.getKey());
        }
        i++;
      }

      for (const pb of pageBreaksToRemove) {
        pb.remove();
      }

      for (const blockKey of desiredBreaksBefore) {
        if (currentBreaksBefore.has(blockKey)) continue;
        const block = $getNodeByKey(blockKey);
        if (!block) continue;

        const pageBreak = $createPageBreakNode();
        block.getWritable().insertBefore(pageBreak, false);
      }
    },
    { tag: "pagination-reflow" },
  );
  return true;
}

export function PaginationPlugin({
  pageHeightPx,
  pageGapPx,
  enabled,
}: PaginationPluginProps) {
  const [editor] = useLexicalComposerContext();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const scheduleReflow = (retryCount = 0) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const ok = runReflow(editor, pageHeightPx);
            if (!ok && retryCount < 8) {
              setTimeout(() => scheduleReflow(retryCount + 1), 50 * (retryCount + 1));
            }
          });
        });
      });
    };

    const unregisterUpdate = editor.registerUpdateListener(({ tags }) => {
      if (tags.has("pagination-reflow")) return;
      scheduleReflow();
    });

    const root = editor.getRootElement();
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    if (root) {
      mutationObserver = new MutationObserver(scheduleReflow);
      mutationObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
        characterData: true,
      });

      resizeObserver = new ResizeObserver(scheduleReflow);
      resizeObserver.observe(root);
    }

    scheduleReflow();

    const onDelayedReflow = () => scheduleReflow();
    window.addEventListener("pagination-delayed-reflow", onDelayedReflow);

    return () => {
      unregisterUpdate();
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("pagination-delayed-reflow", onDelayedReflow);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [editor, enabled, pageHeightPx]);

  return null;
}

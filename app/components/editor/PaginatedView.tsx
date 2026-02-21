import { useEffect, useState, useCallback } from "react";
import type { PropsWithChildren, RefObject } from "react";
import { useEditorContext } from "./core/EditorContext";
import { PAGE_BREAK_SELECTOR } from "./core/blockUtils";

interface PaginatedViewProps extends PropsWithChildren {
  currentPage: number;
  pageCount: number;
  pageWidthPx: number;
  pageHeightPx: number;
  pageGapPx: number;
  containerRef: RefObject<HTMLElement | null>;
}

interface PageBounds {
  pageNumber: number;
  top: number;
  height: number;
}

function computePageBoundsFromDOM(contentRoot: HTMLElement): PageBounds[] {
  const rootRect = contentRoot.getBoundingClientRect();
  const breakEls = contentRoot.querySelectorAll<HTMLElement>(PAGE_BREAK_SELECTOR);
  if (breakEls.length === 0) {
    const h = contentRoot.offsetHeight || contentRoot.scrollHeight;
    return [{ pageNumber: 1, top: 0, height: Math.max(h, 1) }];
  }
  const bounds: PageBounds[] = [];
  let prevBreakBottom = 0;
  breakEls.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const breakTop = rect.top - rootRect.top;
    const breakHeight = rect.height;
    const pageHeight = breakTop - prevBreakBottom;
    bounds.push({
      pageNumber: i + 1,
      top: prevBreakBottom,
      height: Math.max(pageHeight, 1),
    });
    prevBreakBottom = breakTop + breakHeight;
  });
  const contentBottom = contentRoot.scrollHeight;
  bounds.push({
    pageNumber: breakEls.length + 1,
    top: prevBreakBottom,
    height: Math.max(contentBottom - prevBreakBottom, 1),
  });
  return bounds;
}

const OVERLAY_RADIUS = 50;

function filterPagesToRender(bounds: PageBounds[], currentPage: number): PageBounds[] {
  if (bounds.length <= OVERLAY_RADIUS * 2 + 3) return bounds;
  const start = Math.max(1, currentPage - OVERLAY_RADIUS);
  const end = Math.min(bounds.length, currentPage + OVERLAY_RADIUS);
  return bounds.filter((p) => p.pageNumber >= start && p.pageNumber <= end);
}

export function PaginatedView({
  children,
  currentPage,
  pageCount,
  pageWidthPx,
  pageHeightPx,
  pageGapPx,
  containerRef,
}: PaginatedViewProps) {
  const { rootRef } = useEditorContext();
  const [pageBounds, setPageBounds] = useState<PageBounds[]>([]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = computePageBoundsFromDOM(root);
    setPageBounds(bounds);
  }, [rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      characterData: true,
    });
    const onDelayedReflow = () => measure();
    window.addEventListener("pagination-delayed-reflow", onDelayedReflow);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("pagination-delayed-reflow", onDelayedReflow);
    };
  }, [rootRef, measure]);

  return (
    <section
      ref={containerRef}
      className="editor-surface paginated h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 p-8 shadow-inner"
    >
      <div className="sticky top-3 z-20 mb-2 ml-auto w-fit rounded-full border border-zinc-300 bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
        Page {currentPage} / {Math.max(pageCount, 1)}
      </div>
      <div
        className="relative mx-auto min-h-full pb-10"
        style={{
          maxWidth: `${pageWidthPx}px`,
          "--page-height": `${pageHeightPx}px`,
          "--page-gap": `${pageGapPx}px`,
        } as React.CSSProperties}
      >
        <div className="pointer-events-none absolute inset-0 z-0">
          {filterPagesToRender(pageBounds, currentPage).map(({ pageNumber, top, height }) => (
            <div
              key={pageNumber}
              className="page-separator"
              style={{
                top: `${top}px`,
                height: `${height}px`,
              }}
            >
              <span className="page-label">Page {pageNumber}</span>
            </div>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}

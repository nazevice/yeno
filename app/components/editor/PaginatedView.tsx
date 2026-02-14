import type { PropsWithChildren, RefObject } from "react";

interface PaginatedViewProps extends PropsWithChildren {
  currentPage: number;
  pageCount: number;
  pageStridePx: number;
  containerRef: RefObject<HTMLElement | null>;
}

export function PaginatedView({
  children,
  currentPage,
  pageCount,
  pageStridePx,
  containerRef,
}: PaginatedViewProps) {
  const pages = Array.from({ length: Math.max(pageCount, 1) }, (_, index) => index + 1);

  return (
    <section
      ref={containerRef}
      className="editor-surface paginated h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-zinc-200 bg-zinc-100 p-8 shadow-inner"
    >
      <div className="sticky top-3 z-20 mb-2 ml-auto w-fit rounded-full border border-zinc-300 bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm">
        Page {currentPage} / {Math.max(pageCount, 1)}
      </div>
      <div className="relative mx-auto min-h-full max-w-[900px] pb-10">
        <div className="pointer-events-none absolute inset-0">
          {pages.map((page) => (
            <div
              key={page}
              className="page-separator"
              style={{ top: `${(page - 1) * pageStridePx}px` }}
            >
              <span className="page-label">Page {page}</span>
            </div>
          ))}
        </div>
        {children}
      </div>
    </section>
  );
}

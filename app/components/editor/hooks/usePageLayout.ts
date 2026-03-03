import { useCallback, useEffect, useRef, useState } from "react";

export interface PageLayoutConfig {
  headerHeight: number;
  footerHeight: number;
  pageWidth: number;
  pageHeight: number;
  gapPx: number;
}

const MIN_HEADER_HEIGHT = 24;
const MIN_FOOTER_HEIGHT = 24;
const DEFAULT_GAP_PX = 24;

const DEFAULT_CONFIG: PageLayoutConfig = {
  headerHeight: MIN_HEADER_HEIGHT,
  footerHeight: MIN_FOOTER_HEIGHT,
  pageWidth: 794,
  pageHeight: 1123,
  gapPx: DEFAULT_GAP_PX,
};

export function usePageLayout(
  initialPageWidth: number,
  initialPageHeight: number,
): {
  config: PageLayoutConfig;
  headerRef: React.RefObject<HTMLDivElement | null>;
  footerRef: React.RefObject<HTMLDivElement | null>;
  contentTopPadding: number;
  contentBottomPadding: number;
  updatePageSize: (width: number, height: number) => void;
} {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const headerResizeObserverRef = useRef<ResizeObserver | null>(null);
  const footerResizeObserverRef = useRef<ResizeObserver | null>(null);

  const [config, setConfig] = useState<PageLayoutConfig>(() => ({
    ...DEFAULT_CONFIG,
    pageWidth: initialPageWidth,
    pageHeight: initialPageHeight,
  }));

  const measureHeader = useCallback(() => {
    const el = headerRef.current;
    if (!el) return MIN_HEADER_HEIGHT;
    const rect = el.getBoundingClientRect();
    const height = Math.max(MIN_HEADER_HEIGHT, Math.ceil(rect.height));
    return height;
  }, []);

  const measureFooter = useCallback(() => {
    const el = footerRef.current;
    if (!el) return MIN_FOOTER_HEIGHT;
    const rect = el.getBoundingClientRect();
    const height = Math.max(MIN_FOOTER_HEIGHT, Math.ceil(rect.height));
    return height;
  }, []);

  const updateHeaderHeight = useCallback(() => {
    const newHeight = measureHeader();
    setConfig((prev) => {
      if (prev.headerHeight === newHeight) return prev;
      return { ...prev, headerHeight: newHeight };
    });
  }, [measureHeader]);

  const updateFooterHeight = useCallback(() => {
    const newHeight = measureFooter();
    setConfig((prev) => {
      if (prev.footerHeight === newHeight) return prev;
      return { ...prev, footerHeight: newHeight };
    });
  }, [measureFooter]);

  const updatePageSize = useCallback((width: number, height: number) => {
    setConfig((prev) => ({
      ...prev,
      pageWidth: width,
      pageHeight: height,
    }));
  }, []);

  useEffect(() => {
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;

    if (!headerEl || !footerEl) return;

    headerResizeObserverRef.current = new ResizeObserver(() => {
      updateHeaderHeight();
    });
    footerResizeObserverRef.current = new ResizeObserver(() => {
      updateFooterHeight();
    });

    headerResizeObserverRef.current.observe(headerEl);
    footerResizeObserverRef.current.observe(footerEl);

    updateHeaderHeight();
    updateFooterHeight();

    return () => {
      headerResizeObserverRef.current?.disconnect();
      footerResizeObserverRef.current?.disconnect();
    };
  }, [updateHeaderHeight, updateFooterHeight]);

  return {
    config,
    headerRef,
    footerRef,
    contentTopPadding: config.headerHeight,
    contentBottomPadding: config.footerHeight,
    updatePageSize,
  };
}

export function getContentAreaHeight(config: PageLayoutConfig): number {
  return config.pageHeight - config.headerHeight - config.footerHeight;
}

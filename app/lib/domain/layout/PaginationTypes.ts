import type { Block, Section } from "../document/entities";
import type { SectionLayout } from "../document/value-objects/SectionLayout";
import type { BufferRange } from "../document/value-objects/BufferRange";

export interface PageLayout {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

export interface PageContentItem {
  block: Block;
  renderRange?: BufferRange;
}

export interface PageModel {
  id: string;
  sectionId: string;
  pageNumber: number;
  layout: PageLayout;
  content: PageContentItem[];
}

export interface PaginationResult {
  pages: PageModel[];
  totalPages: number;
}

export const DEFAULT_PAGE_WIDTH = 794;
export const DEFAULT_PAGE_HEIGHT = 1123;
export const DEFAULT_MARGINS = { top: 72, right: 72, bottom: 72, left: 72 };

export function resolvePageLayout(sectionLayout: SectionLayout | undefined): PageLayout {
  const margins = sectionLayout?.margins ?? DEFAULT_MARGINS;
  const rawPageSize = sectionLayout?.pageSize;
  const orientation = sectionLayout?.orientation ?? "portrait";
  
  let width = rawPageSize?.width ?? DEFAULT_PAGE_WIDTH;
  let height = rawPageSize?.height ?? DEFAULT_PAGE_HEIGHT;
  
  if (orientation === "landscape") {
    [width, height] = [height, width];
  }
  
  return {
    width,
    height,
    marginTop: margins.top,
    marginRight: margins.right,
    marginBottom: margins.bottom,
    marginLeft: margins.left,
  };
}

export function getAvailableContentHeight(layout: PageLayout): number {
  return layout.height - layout.marginTop - layout.marginBottom;
}

export function getAvailableContentWidth(layout: PageLayout): number {
  return layout.width - layout.marginLeft - layout.marginRight;
}

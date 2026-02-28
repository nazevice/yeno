import type { DocumentSnapshot } from "../domain/document/DocumentSnapshot";
import type { Block, Paragraph, Heading, TextBlock, Section } from "../domain/document/entities";
import { isParagraph, isHeading, isImage, isTable, isList, isBlockquote, isToc, isTextBlock } from "../domain/document/entities";
import { SectionLayout } from "../domain/document/value-objects/SectionLayout";
import type { BufferRange } from "../domain/document/value-objects/BufferRange";
import { BufferRange as BufferRangeClass } from "../domain/document/value-objects/BufferRange";
import type { PageModel, PageContentItem, PageLayout, PaginationResult } from "../domain/layout/PaginationTypes";
import {
  resolvePageLayout,
  getAvailableContentHeight,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PAGE_HEIGHT,
} from "../domain/layout/PaginationTypes";

const ESTIMATED_LINE_HEIGHT = 24;
const ESTIMATED_CHARS_PER_LINE = 80;
const HEADING_LINE_HEIGHT: Record<1 | 2 | 3, number> = { 1: 36, 2: 30, 3: 26 };
const MIN_LINES_PER_PAGE_FRAGMENT = 2;
const SAFETY_BUFFER_PX = 8;

type BlockSizePolicy = "split" | "push";

function getBlockSizePolicy(block: Block): BlockSizePolicy {
  if (isHeading(block)) return "push";
  if (isImage(block)) return "push";
  if (isTable(block)) return "push";
  if (isToc(block)) return "push";
  if (isBlockquote(block)) return "push";
  if (isList(block)) return "split";
  if (isParagraph(block)) return "split";
  return "push";
}

interface MeasurementCache {
  get(blockId: string): number | undefined;
  set(blockId: string, height: number): void;
  clear(): void;
}

function createMeasurementCache(): MeasurementCache {
  const cache = new Map<string, number>();
  return {
    get: (id) => cache.get(id),
    set: (id, height) => cache.set(id, height),
    clear: () => cache.clear(),
  };
}

interface TextBuffer {
  getRange(start: number, end: number): string;
}

function estimateBlockHeight(
  block: Block,
  buffer: TextBuffer,
  contentWidth: number,
  cache?: MeasurementCache,
): number {
  const cached = cache?.get(block.id.toString());
  if (cached !== undefined) return cached;
  
  let height: number;
  
  if (isParagraph(block)) {
    height = estimateTextBlockHeight(block, buffer, contentWidth, ESTIMATED_LINE_HEIGHT);
  } else if (isHeading(block)) {
    height = estimateTextBlockHeight(block, buffer, contentWidth, HEADING_LINE_HEIGHT[block.level]);
  } else if (isImage(block)) {
    height = block.size[1] > 0 ? block.size[1] + 16 : 100;
  } else if (isTable(block)) {
    height = estimateTableHeight(block);
  } else if (isList(block)) {
    height = estimateListHeight(block, buffer, contentWidth);
  } else if (isBlockquote(block)) {
    height = estimateBlockquoteHeight(block, buffer, contentWidth);
  } else if (isToc(block)) {
    height = 200;
  } else {
    height = ESTIMATED_LINE_HEIGHT;
  }
  
  cache?.set(block.id.toString(), height);
  return height;
}

function estimateTextBlockHeight(
  block: TextBlock,
  buffer: TextBuffer,
  contentWidth: number,
  lineHeight: number,
): number {
  const text = buffer.getRange(block.textRange.start, block.textRange.end);
  const explicitLines = (text.match(/\n/g)?.length ?? 0) + 1;
  const avgCharWidth = 8;
  const charsPerLine = Math.max(1, Math.floor(contentWidth / avgCharWidth));
  const wrappedLines = text.length > 0 ? Math.max(explicitLines, Math.ceil(text.length / charsPerLine)) : 1;
  return wrappedLines * lineHeight;
}

function estimateTableHeight(table: import("../domain/document/entities/Table").Table): number {
  const rowCount = table.rows.length;
  const avgRowHeight = 32;
  const headerHeight = 40;
  return headerHeight + rowCount * avgRowHeight;
}

function estimateListHeight(
  list: import("../domain/document/entities/List").List,
  buffer: TextBuffer,
  contentWidth: number,
): number {
  return list.items.reduce((total, item) => {
    if (isTextBlock(item.content)) {
      return total + estimateTextBlockHeight(item.content, buffer, contentWidth - 32, ESTIMATED_LINE_HEIGHT);
    }
    return total + ESTIMATED_LINE_HEIGHT;
  }, 0);
}

function estimateBlockquoteHeight(
  blockquote: import("../domain/document/entities/Blockquote").Blockquote,
  buffer: TextBuffer,
  contentWidth: number,
): number {
  return blockquote.children.reduce((total, child) => {
    if (isTextBlock(child)) {
      return total + estimateTextBlockHeight(child, buffer, contentWidth - 32, ESTIMATED_LINE_HEIGHT);
    }
    return total + ESTIMATED_LINE_HEIGHT;
  }, 0);
}

function estimateLinesForHeight(height: number, lineHeight: number): number {
  return Math.max(1, Math.floor(height / lineHeight));
}

function estimateHeightForLines(lines: number, lineHeight: number): number {
  return lines * lineHeight;
}

function splitTextBlock(
  block: TextBlock,
  buffer: TextBuffer,
  availableHeight: number,
  contentWidth: number,
  lineHeight: number,
): { first: BufferRange; second: BufferRange } | null {
  const text = buffer.getRange(block.textRange.start, block.textRange.end);
  const totalLength = text.length;
  
  if (totalLength === 0) return null;
  
  const totalLines = estimateLinesForHeight(
    estimateTextBlockHeight(block, buffer, contentWidth, lineHeight),
    lineHeight,
  );
  
  const linesThatFit = Math.floor(availableHeight / lineHeight);
  
  if (linesThatFit < MIN_LINES_PER_PAGE_FRAGMENT) {
    return null;
  }
  
  const remainingLines = totalLines - linesThatFit;
  if (remainingLines < MIN_LINES_PER_PAGE_FRAGMENT) {
    return null;
  }
  
  const avgCharsPerLine = Math.max(1, Math.floor(totalLength / totalLines));
  const splitCharOffset = Math.min(
    totalLength - 1,
    linesThatFit * avgCharsPerLine,
  );
  
  const splitPoint = findWordBoundary(text, splitCharOffset);
  
  return {
    first: new BufferRangeClass(block.textRange.start, block.textRange.start + splitPoint),
    second: new BufferRangeClass(block.textRange.start + splitPoint, block.textRange.end),
  };
}

function findWordBoundary(text: string, preferredPosition: number): number {
  if (preferredPosition <= 0 || preferredPosition >= text.length) {
    return preferredPosition;
  }
  
  const searchRadius = 20;
  const start = Math.max(0, preferredPosition - searchRadius);
  const end = Math.min(text.length, preferredPosition + searchRadius);
  const segment = text.slice(start, end);
  
  const spaceBefore = segment.lastIndexOf(" ", preferredPosition - start - 1);
  const spaceAfter = segment.indexOf(" ", preferredPosition - start);
  
  if (spaceBefore >= 0 && preferredPosition - start - spaceBefore <= 10) {
    return start + spaceBefore + 1;
  }
  
  if (spaceAfter >= 0 && spaceAfter - (preferredPosition - start) <= 10) {
    return start + spaceAfter + 1;
  }
  
  return preferredPosition;
}

export class PaginationEngine {
  private cache = createMeasurementCache();
  
  invalidateCache(): void {
    this.cache.clear();
  }
  
  setMeasuredHeight(blockId: string, height: number): void {
    this.cache.set(blockId, height);
  }
  
  paginate(
    snapshot: DocumentSnapshot,
    buffer: TextBuffer,
    options?: { pageWidth?: number; pageHeight?: number },
  ): PaginationResult {
    const pages: PageModel[] = [];
    let globalPageNumber = 0;
    
    const defaultLayout = SectionLayout.default;
    const overridePageSize = options?.pageWidth && options?.pageHeight
      ? { width: options.pageWidth, height: options.pageHeight }
      : null;
    
    for (const section of snapshot.tree.root.children) {
      const sectionLayout = section.layout ? SectionLayout.from(section.layout) : defaultLayout;
      const baseLayout = resolvePageLayout(sectionLayout);
      
      const layout: PageLayout = overridePageSize
        ? { ...baseLayout, width: overridePageSize.width, height: overridePageSize.height }
        : baseLayout;
      
      const availableHeight = getAvailableContentHeight(layout) - SAFETY_BUFFER_PX;
      const contentWidth = layout.width - layout.marginLeft - layout.marginRight;
      
      const sectionPages = this.paginateSection(
        section,
        buffer,
        layout,
        availableHeight,
        contentWidth,
        globalPageNumber,
      );
      
      pages.push(...sectionPages);
      globalPageNumber += sectionPages.length;
    }
    
    if (pages.length === 0) {
      const layout: PageLayout = {
        width: options?.pageWidth ?? DEFAULT_PAGE_WIDTH,
        height: options?.pageHeight ?? DEFAULT_PAGE_HEIGHT,
        marginTop: 72,
        marginRight: 72,
        marginBottom: 72,
        marginLeft: 72,
      };
      pages.push({
        id: "page-empty-1",
        sectionId: "empty",
        pageNumber: 1,
        layout,
        content: [],
      });
    }
    
    return { pages, totalPages: pages.length };
  }
  
  private paginateSection(
    section: Section,
    buffer: TextBuffer,
    layout: PageLayout,
    availableHeight: number,
    contentWidth: number,
    startPageNumber: number,
  ): PageModel[] {
    const pages: PageModel[] = [];
    let currentPageContent: PageContentItem[] = [];
    let currentPageHeight = 0;
    let pageNumber = startPageNumber + 1;
    
    const lineHeight = ESTIMATED_LINE_HEIGHT;
    
    const finalizePage = () => {
      if (currentPageContent.length > 0 || pages.length === 0) {
        pages.push({
          id: `page-${section.id}-${pageNumber}`,
          sectionId: section.id.toString(),
          pageNumber,
          layout,
          content: currentPageContent,
        });
        pageNumber++;
        currentPageContent = [];
        currentPageHeight = 0;
      }
    };
    
    for (const block of section.children) {
      if (block.breakBefore === "page" && currentPageContent.length > 0) {
        finalizePage();
      }
      
      const blockHeight = estimateBlockHeight(block, buffer, contentWidth, this.cache);
      const policy = getBlockSizePolicy(block);
      
      if (policy === "push" && currentPageHeight + blockHeight > availableHeight) {
        if (currentPageContent.length > 0) {
          finalizePage();
        }
        currentPageContent.push({ block });
        currentPageHeight += blockHeight;
        continue;
      }
      
      if (policy === "split" && isTextBlock(block)) {
        const remainingHeight = availableHeight - currentPageHeight;
        
        if (blockHeight <= remainingHeight) {
          currentPageContent.push({ block });
          currentPageHeight += blockHeight;
          continue;
        }
        
        if (currentPageContent.length > 0 && remainingHeight < lineHeight * MIN_LINES_PER_PAGE_FRAGMENT) {
          finalizePage();
          currentPageContent.push({ block });
          currentPageHeight += blockHeight;
          continue;
        }
        
        const split = splitTextBlock(block, buffer, remainingHeight, contentWidth, lineHeight);
        
        if (split) {
          const firstHeight = estimateHeightForLines(
            estimateLinesForHeight(blockHeight, lineHeight),
            lineHeight,
          );
          currentPageContent.push({ block, renderRange: split.first });
          finalizePage();
          
          let remainingRange = split.second;
          let remainingHeight = blockHeight - firstHeight;
          
          while (remainingRange.length > 0) {
            const pageAvailableHeight = availableHeight;
            const linesInFullBlock = estimateLinesForHeight(blockHeight, lineHeight);
            const linesInRemaining = Math.ceil((remainingRange.length / block.textRange.length) * linesInFullBlock);
            const remainingBlockHeight = estimateHeightForLines(linesInRemaining, lineHeight);
            
            if (remainingBlockHeight <= pageAvailableHeight) {
              currentPageContent.push({ block, renderRange: remainingRange });
              currentPageHeight += remainingBlockHeight;
              break;
            }
            
            const nextSplit = splitTextBlock(
              { ...block, textRange: remainingRange } as TextBlock,
              buffer,
              pageAvailableHeight,
              contentWidth,
              lineHeight,
            );
            
            if (!nextSplit) {
              currentPageContent.push({ block, renderRange: remainingRange });
              currentPageHeight += remainingBlockHeight;
              break;
            }
            
            currentPageContent.push({ block, renderRange: nextSplit.first });
            finalizePage();
            remainingRange = nextSplit.second;
          }
        } else {
          if (currentPageContent.length > 0) {
            finalizePage();
          }
          currentPageContent.push({ block });
          currentPageHeight += blockHeight;
        }
      } else {
        if (currentPageHeight + blockHeight > availableHeight && currentPageContent.length > 0) {
          finalizePage();
        }
        currentPageContent.push({ block });
        currentPageHeight += blockHeight;
      }
    }
    
    finalizePage();
    
    return pages;
  }
}

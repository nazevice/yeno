import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { TDocumentDefinitions, Content, ContentText } from "pdfmake/interfaces";
import type { DocumentSnapshot, DocumentMetadata } from "../domain/document/DocumentSnapshot";
import type { Section } from "../domain/document/entities/Section";
import type { Block, Paragraph, Heading, Table, Image, List, Blockquote } from "../domain/document/entities";
import type { TextBufferContent, PieceChunk } from "../domain/document/buffer/TextBufferTypes";
import { isParagraph, isHeading, isTable, isImage, isList, isBlockquote } from "../domain/document/entities";
import type { FormattingMark } from "../domain/document/value-objects/FormattingMark";
import type { AssetRef } from "../domain/document/entities/Image";
import type { BlockId } from "../domain/shared/NodeId";
import type { HeaderFooterContent } from "../domain/document/value-objects/SectionLayout";
import { SectionLayout } from "../domain/document/value-objects/SectionLayout";

const vfsFonts = pdfFonts as unknown as { pdfMake?: { vfs: unknown } };
if (vfsFonts?.pdfMake?.vfs) {
  (pdfMake as unknown as { vfs?: unknown }).vfs = vfsFonts.pdfMake.vfs;
}

type AssetDataUrlMap = Map<string, string>;

export interface PdfExportOptions {
  filename?: string;
}

function assetToDataUrl(asset: AssetRef | null): string | null {
  if (!asset?.bytes?.length) return null;
  try {
    const mime = asset.name.toLowerCase().endsWith(".png") ? "image/png" :
      asset.name.toLowerCase().endsWith(".gif") ? "image/gif" :
      asset.name.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
    const base64 = btoa(String.fromCharCode(...asset.bytes));
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function resolveHeadingNumbersFromSnapshot(snapshot: DocumentSnapshot): Map<BlockId, string> {
  const numberingMap = new Map<BlockId, string>();
  const counters = [0, 0, 0];

  for (const section of snapshot.tree.root.children) {
    if (!section) continue;
    for (const block of section.children) {
      if (isHeading(block)) {
        const levelIndex = block.level - 1;
        counters[levelIndex] = (counters[levelIndex] ?? 0) + 1;
        for (let i = levelIndex + 1; i < 3; i++) {
          counters[i] = 0;
        }
        const number = counters.slice(0, levelIndex + 1).join(".");
        numberingMap.set(block.id, number);
      }
    }
  }

  return numberingMap;
}

export class PdfExporter {
  private fullText: string;
  private headingNumbers: Map<BlockId, string>;

  constructor(
    private snapshot: DocumentSnapshot,
    private assets: AssetDataUrlMap = new Map()
  ) {
    this.fullText = this.reconstructText(snapshot.bufferContent);
    this.headingNumbers = resolveHeadingNumbersFromSnapshot(snapshot);
  }

  export(options: PdfExportOptions = {}): void {
    const definition = this.buildDefinition();
    const pdfDocGenerator = pdfMake.createPdf(definition);
    const filename = options.filename ?? this.getFilename();
    pdfDocGenerator.download(filename);
  }

  private getFilename(): string {
    const title = this.snapshot.metadata.title;
    if (title && title.trim()) {
      return `${title.trim()}.pdf`;
    }
    return "document.pdf";
  }

  private buildDefinition(): TDocumentDefinitions {
    const content = this.buildContent();
    const firstSection = this.snapshot.tree.root.children[0];
    const layout = firstSection?.layout ? SectionLayout.from(firstSection.layout) : undefined;

    const definition: TDocumentDefinitions = {
      info: this.buildInfo(),
      content,
    };

    if (layout?.header) {
      definition.header = (currentPage, pageCount) => 
        this.buildHeaderFooterDynamic(layout.header!, "header", currentPage, pageCount);
    }

    if (layout?.footer) {
      definition.footer = (currentPage, pageCount) => 
        this.buildHeaderFooterDynamic(layout.footer!, "footer", currentPage, pageCount);
    }

    return definition;
  }

  private buildHeaderFooterDynamic(
    content: HeaderFooterContent,
    type: "header" | "footer",
    currentPage: number,
    totalPages: number
  ): Content {
    const columns: Content[] = [];

    if (content.left) {
      columns.push({
        text: this.resolveTemplate(content.left, currentPage, totalPages),
        alignment: "left",
      });
    }

    if (content.center) {
      columns.push({
        text: this.resolveTemplate(content.center, currentPage, totalPages),
        alignment: "center",
      });
    } else if (content.left || content.right) {
      columns.push({ text: "" });
    }

    if (content.right) {
      columns.push({
        text: this.resolveTemplate(content.right, currentPage, totalPages),
        alignment: "right",
      });
    }

    if (columns.length === 0) {
      return { text: "" };
    }

    return {
      columns,
      margin: [48, type === "header" ? 12 : 0, 48, type === "footer" ? 12 : 0] as [number, number, number, number],
    };
  }

  private resolveTemplate(text: string, pageNumber: number, totalPages: number): string {
    return text
      .replace(/{page}/gi, String(pageNumber))
      .replace(/{total}/gi, String(totalPages));
  }

  private buildInfo(): { title?: string; author?: string } {
    const info: { title?: string; author?: string } = {};
    const metadata = this.snapshot.metadata;

    if (metadata.title) {
      info.title = metadata.title;
    }
    if (metadata.author) {
      info.author = metadata.author;
    }

    return info;
  }

  private buildContent(): Content[] {
    const content: Content[] = [];
    const sections = this.snapshot.tree.root.children;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) continue;

      if (i > 0) {
        (content as ContentText[]).push({ text: "", pageBreak: "before" });
      }

      for (const block of section.children) {
        const blockContent = this.mapBlock(block);
        if (blockContent) {
          if (Array.isArray(blockContent)) {
            content.push(...blockContent);
          } else {
            content.push(blockContent);
          }
        }
      }
    }

    return content;
  }

  private mapBlock(block: Block): Content | Content[] | null {
    if (isParagraph(block)) {
      return this.mapParagraph(block);
    }
    if (isHeading(block)) {
      return this.mapHeading(block);
    }
    if (isTable(block)) {
      return this.mapTable(block);
    }
    if (isImage(block)) {
      return this.mapImage(block);
    }
    if (isList(block)) {
      return this.mapList(block);
    }
    if (isBlockquote(block)) {
      return this.mapBlockquote(block);
    }
    return null;
  }

  private mapParagraph(paragraph: Paragraph): Content {
    const text = this.getTextInRange(paragraph.textRange.start, paragraph.textRange.end);
    const textContent = this.mapTextWithMarks(text, paragraph.marks);

    const content: Content = {
      text: textContent,
      alignment: this.mapAlignment(paragraph.textAlign),
    };

    return content;
  }

  private mapHeading(heading: Heading): Content {
    const text = this.getTextInRange(heading.textRange.start, heading.textRange.end);
    const textContent = this.mapTextWithMarks(text, heading.marks);
    const number = this.headingNumbers.get(heading.id);

    const style = `H${heading.level}` as "H1" | "H2" | "H3";

    const content: Content = {
      text: number ? [{ text: number + ".", bold: true }, { text: " " }, ...textContent] : textContent,
      style,
      alignment: this.mapAlignment(heading.textAlign),
    };

    return content;
  }

  private mapTable(table: Table): Content | null {
    if (!table.rows || table.rows.length === 0) {
      return null;
    }

    const body: Content[][] = [];

    for (const row of table.rows) {
      const rowContent: Content[] = [];

      for (const cell of row.cells) {
        const cellParagraphs: Content[] = [];

        for (const child of cell.children) {
          if (isParagraph(child) || isHeading(child)) {
            const text = this.getTextInRange(child.textRange.start, child.textRange.end);
            const textContent = this.mapTextWithMarks(text, child.marks);
            cellParagraphs.push({ text: textContent });
          }
        }

        rowContent.push({
          stack: cellParagraphs.length > 0 ? cellParagraphs : [{ text: "" }],
        });
      }

      body.push(rowContent);
    }

    return {
      table: {
        body,
        widths: table.colWidths?.length ? table.colWidths.map(w => w) : undefined,
      },
      layout: "lightHorizontalLines",
      margin: [0, 5, 0, 5] as [number, number, number, number],
    };
  }

  private mapImage(image: Image): Content | null {
    const assetName = image.assetRef?.name;
    if (!assetName) {
      return null;
    }

    const dataUrl = this.assets.get(assetName);
    if (!dataUrl) {
      return { text: `[Image: ${image.alt || assetName}]`, italics: true };
    }

    let [width, height] = image.size ?? [200, 200];
    const maxWidth = 500;

    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);
    }

    return {
      image: dataUrl,
      width,
      height,
      alignment: "center",
      margin: [0, 5, 0, 5] as [number, number, number, number],
    };
  }

  private mapList(list: List): Content | null {
    if (!list.items || list.items.length === 0) {
      return null;
    }

    const items: Content[] = list.items.map(item => {
      if (isParagraph(item.content) || isHeading(item.content)) {
        const text = this.getTextInRange(item.content.textRange.start, item.content.textRange.end);
        const textContent = this.mapTextWithMarks(text, item.content.marks);
        return { text: textContent };
      }
      return { text: "" };
    });

    if (list.listType === "ordered") {
      return { ol: items };
    }
    return { ul: items };
  }

  private mapBlockquote(blockquote: Blockquote): Content | null {
    if (!blockquote.children || blockquote.children.length === 0) {
      return null;
    }

    const items: Content[] = [];

    for (const child of blockquote.children) {
      if (isParagraph(child) || isHeading(child)) {
        const text = this.getTextInRange(child.textRange.start, child.textRange.end);
        const textContent = this.mapTextWithMarks(text, child.marks);
        items.push({ text: textContent, italics: true });
      }
    }

    return {
      stack: items,
      margin: [20, 0, 0, 0] as [number, number, number, number],
      italics: true,
    };
  }

  private mapTextWithMarks(text: string, marks: readonly FormattingMark[]): Content[] {
    if (!marks || marks.length === 0) {
      return [{ text }];
    }

    const sorted = [...marks].sort((a, b) => a.start - b.start);
    const result: Content[] = [];
    let pos = 0;

    for (const mark of sorted) {
      if (mark.start > pos) {
        result.push({ text: text.slice(pos, mark.start) });
      }

      const slice = text.slice(mark.start, mark.end);
      if (slice.length > 0) {
        result.push(this.mapStyledText(slice, mark));
      }

      pos = mark.end;
    }

    if (pos < text.length) {
      result.push({ text: text.slice(pos) });
    }

    return result;
  }

  private mapStyledText(text: string, mark: FormattingMark): Content {
    const content: Content = { text };

    if (mark.attrs.bold) {
      content.bold = true;
    }
    if (mark.attrs.italic) {
      content.italics = true;
    }
    if (mark.attrs.underline) {
      content.decoration = "underline";
    }
    if (mark.attrs.color) {
      content.color = mark.attrs.color;
    }
    if (mark.attrs.fontSize) {
      content.fontSize = mark.attrs.fontSize;
    }
    if (mark.attrs.font) {
      content.font = mark.attrs.font;
    }
    if (mark.attrs.href) {
      content.link = mark.attrs.href;
      content.decoration = "underline";
      if (!mark.attrs.color) {
        content.color = "#2563eb";
      }
    }

    return content;
  }

  private mapAlignment(align?: string): "left" | "center" | "right" | "justify" | undefined {
    if (align === "left" || align === "center" || align === "right" || align === "justify") {
      return align;
    }
    return undefined;
  }

  private getTextInRange(start: number, end: number): string {
    return this.fullText.slice(start, end);
  }

  private reconstructText(buffer: TextBufferContent): string {
    let text = buffer.baseText ?? "";
    const chunks = buffer.chunks ?? [];

    for (const chunk of chunks) {
      if (chunk.type === "insert" && typeof chunk.pos === "number" && chunk.data != null) {
        if (chunk.pos <= text.length) {
          text = text.slice(0, chunk.pos) + chunk.data + text.slice(chunk.pos);
        }
      } else if (chunk.type === "delete" && typeof chunk.pos === "number" && typeof chunk.len === "number") {
        const end = Math.min(chunk.pos + chunk.len, text.length);
        if (chunk.pos < end) {
          text = text.slice(0, chunk.pos) + text.slice(end);
        }
      }
    }

    return text;
  }
}

export function exportToPdf(
  snapshot: DocumentSnapshot,
  assets: AssetDataUrlMap,
  options?: PdfExportOptions
): void {
  const exporter = new PdfExporter(snapshot, assets);
  exporter.export(options);
}

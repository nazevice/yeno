import { ClipboardPayload, type ClipboardBlock, type ClipboardTextBlock, type ClipboardImageBlock } from "./ClipboardPayload";
import type { FormattingMarkData } from "../document/value-objects/FormattingMark";

export function parseHtml(html: string): ClipboardPayload {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  
  const blocks: ClipboardBlock[] = [];
  
  const body = doc.body;
  for (const child of body.children) {
    const block = parseNode(child);
    if (block) {
      if (Array.isArray(block)) {
        blocks.push(...block);
      } else {
        blocks.push(block);
      }
    }
  }
  
  if (blocks.length === 0 && body.textContent) {
    blocks.push({
      type: "paragraph",
      text: body.textContent,
      marks: [],
    });
  }
  
  return ClipboardPayload.create(blocks);
}

function parseNode(node: Element): ClipboardBlock | ClipboardBlock[] | null {
  const tagName = node.tagName.toLowerCase();
  
  if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
    return parseHeading(node);
  }
  
  if (tagName === "p" || tagName === "div") {
    return parseParagraph(node);
  }
  
  if (tagName === "img") {
    return parseImage(node);
  }
  
  if (tagName === "br") {
    return null;
  }
  
  if (tagName === "ul" || tagName === "ol") {
    return parseList(node);
  }
  
  return parseParagraph(node);
}

function parseHeading(node: Element): ClipboardTextBlock {
  const tagName = node.tagName.toLowerCase();
  const level = tagName === "h1" ? 1 : tagName === "h2" ? 2 : 3;
  const { text, marks } = extractTextAndMarks(node);
  const textAlign = getTextAlign(node);
  
  const result: ClipboardTextBlock = {
    type: "heading",
    level: level as 1 | 2 | 3,
    text,
    marks,
  };
  
  if (textAlign) {
    result.textAlign = textAlign;
  }
  
  return result;
}

function parseParagraph(node: Element): ClipboardTextBlock {
  const { text, marks } = extractTextAndMarks(node);
  const textAlign = getTextAlign(node);
  
  const result: ClipboardTextBlock = {
    type: "paragraph",
    text,
    marks,
  };
  
  if (textAlign) {
    result.textAlign = textAlign;
  }
  
  return result;
}

function parseImage(node: Element): ClipboardImageBlock | null {
  const src = node.getAttribute("src");
  const alt = node.getAttribute("alt") ?? "";
  const width = parseInt(node.getAttribute("data-width") ?? node.getAttribute("width") ?? "0", 10);
  const height = parseInt(node.getAttribute("data-height") ?? node.getAttribute("height") ?? "0", 10);
  
  if (!src) return null;
  
  let bytes: number[] = [];
  let assetName = `image-${crypto.randomUUID()}.png`;
  
  if (src.startsWith("data:")) {
    const match = src.match(/^data:image\/(\w+);base64,(.+)$/);
    if (match) {
      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      assetName = `image-${crypto.randomUUID()}.${ext}`;
      try {
        const binary = atob(match[2]!);
        bytes = Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i));
      } catch {
        return null;
      }
    }
  }
  
  return {
    type: "image",
    assetName,
    alt,
    size: [width, height],
    bytes,
  };
}

function parseList(node: Element): ClipboardTextBlock[] {
  const blocks: ClipboardTextBlock[] = [];
  const items = node.querySelectorAll(":scope > li");
  
  for (const item of items) {
    const { text, marks } = extractTextAndMarks(item);
    if (text.trim()) {
      blocks.push({
        type: "paragraph",
        text: text.trim(),
        marks,
      });
    }
  }
  
  return blocks;
}

interface TextExtraction {
  text: string;
  marks: FormattingMarkData[];
}

function extractTextAndMarks(node: Element): TextExtraction {
  const text = node.textContent ?? "";
  const marks: FormattingMarkData[] = [];
  
  extractMarksRecursive(node, 0, marks, {});
  
  return { text, marks };
}

function extractMarksRecursive(
  node: Element | Node,
  startOffset: number,
  marks: FormattingMarkData[],
  inheritedAttrs: { bold?: boolean; italic?: boolean; underline?: boolean; font?: string; fontSize?: number }
): number {
  let offset = startOffset;
  
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      offset += child.textContent?.length ?? 0;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      const tagName = element.tagName.toLowerCase();
      
      const attrs = { ...inheritedAttrs };
      
      if (tagName === "strong" || tagName === "b") {
        attrs.bold = true;
      } else if (tagName === "em" || tagName === "i") {
        attrs.italic = true;
      } else if (tagName === "u") {
        attrs.underline = true;
      }
      
      const style = element.getAttribute("style") ?? "";
      const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/i);
      const fontSizeMatch = style.match(/font-size:\s*(\d+)px/i);
      const textDecorationMatch = style.match(/text-decoration:\s*underline/i);
      
      if (fontFamilyMatch) {
        attrs.font = fontFamilyMatch[1]!.trim();
      }
      if (fontSizeMatch) {
        attrs.fontSize = parseInt(fontSizeMatch[1]!, 10);
      }
      if (textDecorationMatch) {
        attrs.underline = true;
      }
      
      const childStart = offset;
      offset = extractMarksRecursive(element, offset, marks, attrs);
      const childEnd = offset;
      
      if (childStart < childEnd && (attrs.bold || attrs.italic || attrs.underline || attrs.font || attrs.fontSize)) {
        marks.push({
          start: childStart,
          end: childEnd,
          attrs: {
            bold: attrs.bold,
            italic: attrs.italic,
            underline: attrs.underline,
            font: attrs.font,
            fontSize: attrs.fontSize,
          },
        });
      }
    }
  }
  
  return offset;
}

function getTextAlign(node: Element): "left" | "center" | "right" | "justify" | undefined {
  const style = node.getAttribute("style") ?? "";
  const match = style.match(/text-align:\s*(left|center|right|justify)/i);
  if (match) {
    return match[1] as "left" | "center" | "right" | "justify";
  }
  return undefined;
}

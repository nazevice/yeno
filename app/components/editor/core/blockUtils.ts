import { toImageToken } from "~/lib/doc/imageToken";

export const BLOCK_TAGS = ["P", "H1", "H2", "H3", "BLOCKQUOTE", "LI", "DIV"] as const;
export const PAGE_BREAK_SELECTOR = '[data-type="page-break"]';
export const IMAGE_BLOCK_SELECTOR = '[data-type="image"]';

/** Get text content from a single block element (p, h1, table cell, etc.). */
export function getBlockTextContent(block: HTMLElement): string {
  const parts: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    const el = node as HTMLElement;
    if (el.getAttribute?.("data-type") === "image") {
      const name = el.getAttribute("data-asset") ?? "";
      const alt = el.getAttribute("data-alt") ?? name;
      const w = el.getAttribute("data-width");
      const h = el.getAttribute("data-height");
      const width = w ? Number.parseInt(w, 10) : undefined;
      const height = h ? Number.parseInt(h, 10) : undefined;
      parts.push(toImageToken(name, alt, width, height));
      return;
    }
    for (let child = el.childNodes.length - 1; child >= 0; child--) {
      walk(el.childNodes[child]!);
    }
  }

  for (let i = 0; i < block.childNodes.length; i++) {
    walk(block.childNodes[i]!);
  }
  return parts.reverse().join("");
}

/** Get root-level block elements (excluding page breaks). */
export function getPaginateableBlocks(root: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  for (const child of root.children) {
    const el = child as HTMLElement;
    if (el.getAttribute?.("data-type") === "page-break") continue;
    blocks.push(el);
  }
  return blocks;
}

export function createPageBreakElement(): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("data-type", "page-break");
  div.setAttribute("data-lexical-page-break", "true");
  div.className = "page-break-node";
  return div;
}

export function createImageBlockElement(
  assetName: string,
  alt: string,
  width?: number,
  height?: number,
): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("data-type", "image");
  div.setAttribute("contenteditable", "false");
  div.setAttribute("data-asset", assetName);
  div.setAttribute("data-alt", alt || assetName);
  if (width != null) div.setAttribute("data-width", String(width));
  if (height != null) div.setAttribute("data-height", String(height));
  div.className = "my-2 inline-block relative";
  const img = document.createElement("img");
  img.setAttribute("data-asset", assetName);
  img.alt = alt || assetName;
  img.loading = "lazy";
  div.appendChild(img);
  return div;
}

export function createParagraphElement(): HTMLParagraphElement {
  return document.createElement("p");
}

export function createHeadingElement(level: 1 | 2 | 3): HTMLHeadingElement {
  return document.createElement(`h${level}` as "h1" | "h2" | "h3");
}

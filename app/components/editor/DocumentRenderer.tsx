/**
 * Renders DocumentTree + TextBuffer to DOM.
 * Applies InlineMarks (bold, italic, font) when rendering paragraphs/headings.
 */

import { DEFAULT_FONT } from "~/lib/doc/fonts";
import type {
  BlockNode,
  DocumentTree,
  InlineMark,
  ParagraphNode,
  HeadingNode,
} from "~/lib/doc/schema";
import type { TextBuffer } from "~/lib/doc/textBuffer";

export function renderDocument(
  root: HTMLElement,
  tree: DocumentTree,
  buffer: TextBuffer,
  getAssetDataUrl?: (name: string) => string | null,
): void {
  root.innerHTML = "";
  for (const section of tree.root.children) {
    for (const block of section.children) {
      const el = renderBlock(block, tree, buffer, getAssetDataUrl);
      if (el) root.appendChild(el);
    }
  }
  if (root.childNodes.length === 0) {
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    root.appendChild(p);
  }
}

function renderBlock(
  block: BlockNode,
  _tree: DocumentTree,
  buffer: TextBuffer,
  getAssetDataUrl?: (name: string) => string | null,
): HTMLElement | null {
  if (block.type === "paragraph") {
    return renderParagraph(block, buffer);
  }
  if (block.type === "heading") {
    return renderHeading(block, buffer);
  }
  if (block.type === "image") {
    return renderImage(block, getAssetDataUrl);
  }
  if (block.type === "table") {
    return renderTable(block, buffer);
  }
  if (block.type === "blockquote") {
    return renderBlockquote(block, buffer, getAssetDataUrl);
  }
  if (block.type === "list") {
    return renderList(block, buffer, getAssetDataUrl);
  }
  return null;
}

function renderParagraph(node: ParagraphNode, buffer: TextBuffer): HTMLParagraphElement {
  const p = document.createElement("p");
  p.setAttribute("data-node-id", node.id);
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  applyTextWithMarks(p, text, node.marks);
  if (!p.childNodes.length) {
    p.innerHTML = "<br>";
  }
  return p;
}

function renderHeading(node: HeadingNode, buffer: TextBuffer): HTMLHeadingElement {
  const tag = `h${node.level}` as "h1" | "h2" | "h3";
  const el = document.createElement(tag);
  el.setAttribute("data-node-id", node.id);
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  applyTextWithMarks(el, text, node.marks);
  if (!el.childNodes.length) {
    el.innerHTML = "<br>";
  }
  return el;
}

function applyTextWithMarks(
  container: HTMLElement,
  text: string,
  marks: InlineMark[],
): void {
  if (marks.length === 0) {
    container.textContent = text;
    return;
  }
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let pos = 0;
  for (const mark of sorted) {
    if (mark.start > pos) {
      container.appendChild(document.createTextNode(text.slice(pos, mark.start)));
    }
    const slice = text.slice(mark.start, mark.end);
    if (slice.length === 0) continue;
    let node: HTMLElement = document.createElement("span");
    if (mark.attrs?.i) {
      const em = document.createElement("em");
      em.appendChild(node);
      node = em;
    }
    if (mark.attrs?.b) {
      const strong = document.createElement("strong");
      strong.appendChild(node);
      node = strong;
    }
    if (mark.attrs?.font || mark.attrs?.fontSize) {
      const span = document.createElement("span");
      const font = mark.attrs.font as string | undefined;
      const fontSize = mark.attrs.fontSize as number | undefined;
      if (font && font !== DEFAULT_FONT) span.style.fontFamily = font;
      if (fontSize != null && fontSize !== 16) {
        span.style.fontSize = `${fontSize}px`;
      }
      span.appendChild(node);
      node = span;
    }
    node.appendChild(document.createTextNode(slice));
    container.appendChild(node);
    pos = mark.end;
  }
  if (pos < text.length) {
    container.appendChild(document.createTextNode(text.slice(pos)));
  }
}

function renderImage(
  node: { id: string; alt: string; assetRef: { name: string }; size: [number, number] },
  getAssetDataUrl?: (name: string) => string | null,
): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("data-type", "image");
  div.setAttribute("data-node-id", node.id);
  div.setAttribute("contenteditable", "false");
  div.setAttribute("data-asset", node.assetRef.name);
  div.setAttribute("data-alt", node.alt);
  div.className = "my-2 inline-block relative";
  const img = document.createElement("img");
  img.setAttribute("data-asset", node.assetRef.name);
  img.alt = node.alt;
  img.loading = "lazy";
  const dataUrl = getAssetDataUrl?.(node.assetRef.name);
  if (dataUrl) img.src = dataUrl;
  div.appendChild(img);
  return div;
}

function renderTable(
  node: { id: string; textRange: { start: number; end: number }; rows: number; cols: number },
  buffer: TextBuffer,
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "editor-table w-full border-collapse my-2";
  table.setAttribute("data-node-id", node.id);
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  const rows = text.split("\n");
  for (let r = 0; r < node.rows; r++) {
    const tr = document.createElement("tr");
    tr.className = "editor-table-row";
    const rowText = rows[r] ?? "";
    const cells = rowText.split("\t");
    for (let c = 0; c < node.cols; c++) {
      const td = document.createElement("td");
      td.className = "editor-table-cell border border-zinc-300 p-1 align-top";
      td.textContent = cells[c] ?? "";
      if (!td.textContent) td.innerHTML = "<br>";
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  return table;
}

function renderBlockquote(
  block: Extract<BlockNode, { type: "blockquote" }>,
  buffer: TextBuffer,
  getAssetDataUrl?: (name: string) => string | null,
): HTMLQuoteElement {
  const q = document.createElement("blockquote");
  const fakeTree: DocumentTree = { version: 2, root: { children: [] } };
  for (const child of block.children) {
    const el = renderBlock(child as BlockNode, fakeTree, buffer, getAssetDataUrl);
    if (el) q.appendChild(el);
  }
  return q;
}

function renderList(
  block: Extract<BlockNode, { type: "list" }>,
  buffer: TextBuffer,
  getAssetDataUrl?: (name: string) => string | null,
): HTMLOListElement | HTMLUListElement {
  const tag = block.listType === "ordered" ? "ol" : "ul";
  const el = document.createElement(tag);
  const fakeTree: DocumentTree = { version: 2, root: { children: [] } };
  for (const item of block.items) {
    const li = document.createElement("li");
    const childEl = renderBlock(item.content as BlockNode, fakeTree, buffer, getAssetDataUrl);
    if (childEl) li.appendChild(childEl);
    el.appendChild(li);
  }
  return el;
}

/**
 * Renders Document to DOM.
 * Uses the new domain model.
 */

import { DEFAULT_FONT } from "~/lib/doc/fonts";
import type { Document as DomainDocument } from "~/lib/domain/document/Document";
import type { Block, Paragraph, Heading, Table, Image, List, Blockquote, TocBlock } from "~/lib/domain/document/entities";
import { TABLE_CELL_SEPARATOR } from "~/lib/domain/document/entities/Table";
import type { FormattingMark } from "~/lib/domain/document/value-objects/FormattingMark";
import { isParagraph, isHeading, isImage, isTable, isList, isBlockquote, isToc } from "~/lib/domain/document/entities";
import { resolveHeadingNumbers, getHeadingList } from "~/lib/domain/document/HeadingNumberingResolver";
import type { BlockId } from "~/lib/domain/shared/NodeId";


export function renderDocument(
  root: HTMLElement,
  doc: DomainDocument,
  getAssetDataUrl?: (name: string) => string | null,
): void {
  root.innerHTML = "";
  
  const buffer = doc.getBuffer();
  const headingNumbers = resolveHeadingNumbers(doc);
  
  for (const section of doc.sections) {
    for (const block of section.children) {
      const el = renderBlock(block, doc, buffer, getAssetDataUrl, headingNumbers);
      if (el) {
        root.appendChild(el);
      }
    }
  }
  
  if (root.childNodes.length === 0) {
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    root.appendChild(p);
  }
}

function renderBlock(
  block: Block,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl: ((name: string) => string | null) | undefined,
  headingNumbers: Map<BlockId, string>,
): HTMLElement | null {
  if (isParagraph(block)) {
    return renderParagraph(block, buffer);
  }
  if (isHeading(block)) {
    return renderHeading(block, buffer, headingNumbers);
  }
  if (isToc(block)) {
    return renderToc(block, doc, buffer, headingNumbers);
  }
  if (isImage(block)) {
    return renderImage(block, getAssetDataUrl);
  }
  if (isTable(block)) {
    return renderTable(block, doc, buffer, getAssetDataUrl, headingNumbers);
  }
  if (isBlockquote(block)) {
    return renderBlockquote(block, doc, buffer, getAssetDataUrl, headingNumbers);
  }
  if (isList(block)) {
    return renderList(block, doc, buffer, getAssetDataUrl, headingNumbers);
  }
  return null;
}

function renderParagraph(node: Paragraph, buffer: { getRange: (start: number, end: number) => string }): HTMLParagraphElement {
  const p = document.createElement("p");
  p.setAttribute("data-node-id", node.id.toString());
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  applyTextWithMarks(p, text, node.marks);
  if (node.textAlign) {
    p.style.textAlign = node.textAlign;
  }
  if (!p.childNodes.length) {
    p.innerHTML = "<br>";
  }
  return p;
}

function renderHeading(node: Heading, buffer: { getRange: (start: number, end: number) => string }, headingNumbers: Map<BlockId, string>): HTMLHeadingElement {
  const tag = `h${node.level}` as "h1" | "h2" | "h3";
  const el = document.createElement(tag);
  const headingId = `heading-${node.id}`;
  el.id = headingId;
  el.setAttribute("data-node-id", node.id.toString());
  
  const number = headingNumbers.get(node.id);
  if (number) {
    const numSpan = document.createElement("span");
    numSpan.className = "heading-number";
    numSpan.textContent = number + ".";
    el.appendChild(numSpan);
    el.appendChild(document.createTextNode(" "));
  }
  
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  applyTextWithMarks(el, text, node.marks);
  if (node.textAlign) {
    el.style.textAlign = node.textAlign;
  }
  if (!el.childNodes.length || (number && el.childNodes.length === 2)) {
    el.appendChild(document.createElement("br"));
  }
  return el;
}

function renderToc(node: TocBlock, doc: DomainDocument, buffer: { getRange: (start: number, end: number) => string }, headingNumbers: Map<BlockId, string>): HTMLElement {
  const container = document.createElement("nav");
  container.setAttribute("data-node-id", node.id.toString());
  container.setAttribute("data-type", "toc");
  container.className = "toc-block";
  
  if (node.title) {
    const title = document.createElement("h2");
    title.textContent = node.title;
    container.appendChild(title);
  }
  
  const headings = getHeadingList(doc);
  if (headings.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-zinc-400 italic";
    empty.textContent = "No headings in document";
    container.appendChild(empty);
    return container;
  }
  
  const list = document.createElement("ul");
  list.className = "toc-list";
  
  for (const heading of headings) {
    const li = document.createElement("li");
    li.className = `toc-item toc-level-${heading.level}`;
    
    const a = document.createElement("a");
    a.href = `#heading-${heading.id}`;
    a.className = "toc-link";
    
    const numSpan = document.createElement("span");
    numSpan.className = "toc-number";
    numSpan.textContent = heading.number;
    a.appendChild(numSpan);
    a.appendChild(document.createTextNode(" "));
    
    const textSpan = document.createElement("span");
    textSpan.className = "toc-text";
    textSpan.textContent = heading.text;
    a.appendChild(textSpan);
    
    a.onclick = (e) => {
      e.preventDefault();
      const target = document.getElementById(`heading-${heading.id}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    
    li.appendChild(a);
    list.appendChild(li);
  }
  
  container.appendChild(list);
  return container;
}

function applyTextWithMarks(
  container: HTMLElement,
  text: string,
  marks: readonly FormattingMark[],
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
    
    if (mark.attrs.href) {
      const a = document.createElement("a");
      const href = mark.attrs.href;
      a.href = href.startsWith("mailto:") || href.startsWith("http://") || href.startsWith("https://") ? href : (href.includes("@") ? `mailto:${href}` : `https://${href}`);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.color = "#2563eb";
      a.style.textDecoration = "underline";
      a.style.cursor = "pointer";
      a.title = `${a.href} (Ctrl+click to open)`;
      a.appendChild(node);
      node = a;
    }
    if (mark.attrs.underline && !mark.attrs.href) {
      const u = document.createElement("u");
      u.appendChild(node);
      node = u;
    }
    if (mark.attrs.italic) {
      const em = document.createElement("em");
      em.appendChild(node);
      node = em;
    }
    if (mark.attrs.bold) {
      const strong = document.createElement("strong");
      strong.appendChild(node);
      node = strong;
    }
    if (mark.attrs.font || mark.attrs.fontSize) {
      const span = document.createElement("span");
      const font = mark.attrs.font;
      const fontSize = mark.attrs.fontSize;
      if (font && font !== DEFAULT_FONT) span.style.fontFamily = font;
      if (fontSize != null && fontSize !== 16) {
        span.style.fontSize = `${fontSize}px`;
      }
      span.appendChild(node);
      node = span;
    }
    if (mark.attrs.color) {
      node.style.color = mark.attrs.color;
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
  node: Image,
  getAssetDataUrl?: (name: string) => string | null,
): HTMLDivElement {
  const div = document.createElement("div");
  div.setAttribute("data-type", "image");
  div.setAttribute("data-node-id", node.id.toString());
  div.setAttribute("contenteditable", "false");
  div.setAttribute("data-asset", node.assetRef.name);
  div.setAttribute("data-alt", node.alt);
  const [w, h] = node.size;
  if (w > 0 && h > 0) {
    div.setAttribute("data-width", String(w));
    div.setAttribute("data-height", String(h));
  }
  div.className = "my-2 inline-block relative";
  const img = document.createElement("img");
  img.setAttribute("data-asset", node.assetRef.name);
  img.alt = node.alt;
  img.loading = "lazy";
  if (w > 0 && h > 0) {
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
  }
  const dataUrl = getAssetDataUrl?.(node.assetRef.name);
  if (dataUrl) img.src = dataUrl;
  div.appendChild(img);
  return div;
}

function renderTable(
  node: Table,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl: ((name: string) => string | null) | undefined,
  headingNumbers: Map<BlockId, string>,
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "editor-table w-full border-collapse my-2";
  table.setAttribute("data-node-id", node.id.toString());
  for (const row of node.rows) {
    const tr = document.createElement("tr");
    tr.className = "editor-table-row";
    for (const cell of row.cells) {
      const td = document.createElement("td");
      td.className = "editor-table-cell border border-zinc-300 p-1 align-top";
      td.setAttribute("contenteditable", "true");
      td.setAttribute("data-cell-id", cell.id.toString());
      for (const child of cell.children) {
        const el = renderBlock(child, doc, buffer, getAssetDataUrl, headingNumbers);
        if (el) td.appendChild(el);
      }
      if (!td.childNodes.length) td.innerHTML = "<br>";
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  return table;
}

function renderBlockquote(
  block: Blockquote,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl: ((name: string) => string | null) | undefined,
  headingNumbers: Map<BlockId, string>,
): HTMLQuoteElement {
  const q = document.createElement("blockquote");
  for (const child of block.children) {
    const el = renderBlock(child, doc, buffer, getAssetDataUrl, headingNumbers);
    if (el) q.appendChild(el);
  }
  return q;
}

function renderList(
  block: List,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl: ((name: string) => string | null) | undefined,
  headingNumbers: Map<BlockId, string>,
): HTMLOListElement | HTMLUListElement {
  const tag = block.listType === "ordered" ? "ol" : "ul";
  const el = document.createElement(tag);
  for (const item of block.items) {
    const li = document.createElement("li");
    const childEl = renderBlock(item.content, doc, buffer, getAssetDataUrl, headingNumbers);
    if (childEl) li.appendChild(childEl);
    el.appendChild(li);
  }
  return el;
}

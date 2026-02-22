/**
 * Renders Document to DOM.
 * Uses the new domain model.
 */

import { DEFAULT_FONT } from "~/lib/doc/fonts";
import type { Document as DomainDocument } from "~/lib/domain/document/Document";
import type { Block, Paragraph, Heading, Table, Image, List, Blockquote } from "~/lib/domain/document/entities";
import type { FormattingMark } from "~/lib/domain/document/value-objects/FormattingMark";
import { isParagraph, isHeading, isImage, isTable, isList, isBlockquote } from "~/lib/domain/document/entities";

const _log = (loc: string, msg: string, data: object) => {
  fetch('http://127.0.0.1:7242/ingest/033aa4d5-20bc-4d22-89ae-24eb7521ba4b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:loc,message:msg,data,timestamp:Date.now()})}).catch(()=>{});
};
export function renderDocument(
  root: HTMLElement,
  doc: DomainDocument,
  getAssetDataUrl?: (name: string) => string | null,
): void {
  root.innerHTML = "";
  
  const buffer = doc.getBuffer();
  const docTextLen = doc.getText().length;
  
  console.log('renderDocument', { docTextLen, bufferText: doc.getText() });
  
  for (const section of doc.sections) {
    for (const block of section.children) {
      if (isParagraph(block)) {
        console.log('  paragraph block', { 
          range: `[${block.textRange.start}, ${block.textRange.end}]`,
          text: buffer.getRange(block.textRange.start, block.textRange.end)
        });
      }
      const el = renderBlock(block, doc, buffer, getAssetDataUrl);
      if (el) {
        root.appendChild(el);
      }
    }
  }
  
  const rootTextLen = root.innerText?.length ?? 0;
  console.log('renderDocument done', { docTextLen, rootTextLen, childCount: root.childNodes.length });
  
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
  getAssetDataUrl?: (name: string) => string | null,
): HTMLElement | null {
  if (isParagraph(block)) {
    return renderParagraph(block, buffer);
  }
  if (isHeading(block)) {
    return renderHeading(block, buffer);
  }
  if (isImage(block)) {
    return renderImage(block, getAssetDataUrl);
  }
  if (isTable(block)) {
    return renderTable(block, buffer);
  }
  if (isBlockquote(block)) {
    return renderBlockquote(block, doc, buffer, getAssetDataUrl);
  }
  if (isList(block)) {
    return renderList(block, doc, buffer, getAssetDataUrl);
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

function renderHeading(node: Heading, buffer: { getRange: (start: number, end: number) => string }): HTMLHeadingElement {
  const tag = `h${node.level}` as "h1" | "h2" | "h3";
  const el = document.createElement(tag);
  el.setAttribute("data-node-id", node.id.toString());
  const text = buffer.getRange(node.textRange.start, node.textRange.end);
  applyTextWithMarks(el, text, node.marks);
  if (node.textAlign) {
    el.style.textAlign = node.textAlign;
  }
  if (!el.childNodes.length) {
    el.innerHTML = "<br>";
  }
  return el;
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
  node: Table,
  buffer: { getRange: (start: number, end: number) => string },
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "editor-table w-full border-collapse my-2";
  table.setAttribute("data-node-id", node.id.toString());
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
  block: Blockquote,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl?: (name: string) => string | null,
): HTMLQuoteElement {
  const q = document.createElement("blockquote");
  for (const child of block.children) {
    const el = renderBlock(child, doc, buffer, getAssetDataUrl);
    if (el) q.appendChild(el);
  }
  return q;
}

function renderList(
  block: List,
  doc: DomainDocument,
  buffer: { getRange: (start: number, end: number) => string },
  getAssetDataUrl?: (name: string) => string | null,
): HTMLOListElement | HTMLUListElement {
  const tag = block.listType === "ordered" ? "ol" : "ul";
  const el = document.createElement(tag);
  for (const item of block.items) {
    const li = document.createElement("li");
    const childEl = renderBlock(item.content, doc, buffer, getAssetDataUrl);
    if (childEl) li.appendChild(childEl);
    el.appendChild(li);
  }
  return el;
}

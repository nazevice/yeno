import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";
import { $getRoot, type LexicalEditor } from "lexical";
import { $generateHtmlFromNodes } from "@lexical/html";

import { DEFAULT_FONT } from "./fonts";
import type { DocumentPayload, PerfSnapshot } from "./schema";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", bytes).then((hash) => {
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
}

function extractRangesFromHtml(html: string): DocumentPayload["metadata"]["ranges"] {
  const ranges: DocumentPayload["metadata"]["ranges"] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  let cursor = 0;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      cursor += node.textContent?.length ?? 0;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const textLen = element.innerText.length;
      if (element.tagName === "STRONG" && textLen > 0) {
        ranges.push({ start: Math.max(0, cursor), end: cursor + textLen, attrs: { b: true } });
      }
      if (element.tagName === "EM" && textLen > 0) {
        ranges.push({ start: Math.max(0, cursor), end: cursor + textLen, attrs: { i: true } });
      }
      if (["H1", "H2", "H3"].includes(element.tagName) && textLen > 0) {
        ranges.push({
          start: Math.max(0, cursor),
          end: cursor + textLen,
          type: "h",
          level: Number.parseInt(element.tagName[1] ?? "1", 10),
        });
      }
      if (element.tagName === "SPAN" && textLen > 0) {
        const fontFamily = element.style?.fontFamily?.trim();
        if (fontFamily && fontFamily !== DEFAULT_FONT) {
          ranges.push({
            start: Math.max(0, cursor),
            end: cursor + textLen,
            attrs: { font: fontFamily },
          });
        }
      }
    }
    node = walker.nextNode();
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

export function buildPayload(editor: LexicalEditor): DocumentPayload {
  let text = "";
  let html = "";
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent();
    html = $generateHtmlFromNodes(editor, null);
  });

  return {
    baseText: text,
    chunks: [{ type: "original", offset: 0, len: text.length, source: "baseText" }],
    metadata: {
      ranges: extractRangesFromHtml(html),
      custom: { engine: "lexical" },
    },
    versions: [],
    assets: [],
  };
}

export async function saveDocument(path: string, payload: DocumentPayload): Promise<PerfSnapshot> {
  if (isTauriRuntime()) {
    return invoke<PerfSnapshot>("save_grokedoc", { request: { path, payload } });
  }

  const zip = new JSZip();
  const content = new TextEncoder().encode(JSON.stringify(payload));
  const metadata = JSON.stringify(payload.metadata, null, 2);
  zip.file("content.cbor", content);
  zip.file("metadata.json", metadata);
  zip.file("assets/rels.json", "{}");
  const checksum = await sha256Hex(JSON.stringify(payload));
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: "1.0",
        contentType: "text/grokedoc",
        lastModified: new Date().toISOString(),
        checksum,
        files: {
          content: "content.cbor",
          metadata: "metadata.json",
          versions: [],
          assets: [],
        },
      },
      null,
      2,
    ),
  );
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "document.grokedoc";
  anchor.click();
  URL.revokeObjectURL(url);

  return {
    operation: "save_grokedoc_web_fallback",
    elapsedMs: 0,
    payloadBytes: JSON.stringify(payload).length,
  };
}

export async function exportMarkdown(path: string, payload: DocumentPayload): Promise<PerfSnapshot> {
  if (isTauriRuntime()) {
    return invoke<PerfSnapshot>("export_document_markdown", {
      request: {
        path,
        baseText: payload.baseText,
        chunks: payload.chunks,
      },
    });
  }

  const blob = new Blob([payload.baseText], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "document.md";
  anchor.click();
  URL.revokeObjectURL(url);
  return {
    operation: "export_document_markdown_web_fallback",
    elapsedMs: 0,
    payloadBytes: payload.baseText.length,
  };
}

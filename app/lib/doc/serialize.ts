import JSZip from "jszip";
import { invoke } from "@tauri-apps/api/core";

import type { DocumentPayload, DocumentTree, PerfSnapshot } from "./schema";
import type { EditorEngine } from "./editorEngine";

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

function extractAssetsFromTree(tree: DocumentTree): DocumentPayload["assets"] {
  const assets: DocumentPayload["assets"] = [];
  for (const section of tree.root.children) {
    for (const block of section.children) {
      if (block.type === "image") {
        assets.push(block.assetRef);
      }
    }
  }
  return assets;
}

export function buildPayload(engine: EditorEngine): DocumentPayload {
  const content = engine.textBuffer.toContent();
  const tree = JSON.parse(JSON.stringify(engine.tree)) as DocumentTree;
  return {
    baseText: content.baseText,
    chunks: content.chunks,
    metadata: { custom: { engine: "yeno" } },
    versions: [],
    assets: extractAssetsFromTree(engine.tree),
    documentTree: tree,
  };
}

export async function saveDocument(path: string, payload: DocumentPayload): Promise<PerfSnapshot> {
  if (isTauriRuntime()) {
    return invoke<PerfSnapshot>("save_grokedoc", { request: { path, payload } });
  }

  const zip = new JSZip();
  const content = new TextEncoder().encode(JSON.stringify({
    baseText: payload.baseText,
    chunks: payload.chunks,
  }));
  const metadata = JSON.stringify(payload.metadata, null, 2);
  const documentTree = JSON.stringify(payload.documentTree, null, 2);
  zip.file("content.cbor", content);
  zip.file("metadata.json", metadata);
  zip.file("documentTree.json", documentTree);
  zip.file("assets/rels.json", "{}");
  const checksum = await sha256Hex(JSON.stringify(payload));
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        schemaVersion: "2.0",
        contentType: "text/grokedoc",
        lastModified: new Date().toISOString(),
        checksum,
        files: {
          content: "content.cbor",
          metadata: "metadata.json",
          documentTree: "documentTree.json",
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

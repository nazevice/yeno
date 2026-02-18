import { invoke } from "@tauri-apps/api/core";

import { applyMetadataRanges } from "./applyRanges";
import { splitLineByImageTokens } from "./imageToken";
import {
  createParagraphElement,
  createImageBlockElement,
} from "~/components/editor/core/blockUtils";
import type { AssetRef, DocumentPayload, PerfSnapshot } from "./schema";

function assetToDataUrl(asset: AssetRef): string | null {
  if (!asset.bytes?.length) return null;
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

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function rebuildText(payload: DocumentPayload): string {
  let text = payload.baseText ?? "";
  for (const chunk of payload.chunks) {
    if (chunk.type === "insert" && typeof chunk.pos === "number" && chunk.data) {
      const before = text.slice(0, chunk.pos);
      const after = text.slice(chunk.pos);
      text = `${before}${chunk.data}${after}`;
    }
    if (chunk.type === "delete" && typeof chunk.pos === "number" && typeof chunk.len === "number") {
      text = `${text.slice(0, chunk.pos)}${text.slice(chunk.pos + chunk.len)}`;
    }
  }
  return text;
}

export async function loadDocument(path: string): Promise<{
  payload: DocumentPayload;
  perf: PerfSnapshot;
  text: string;
}> {
  if (!isTauriRuntime()) {
    throw new Error("Open operation is available in Tauri desktop runtime.");
  }

  const [payload, perf] = await invoke<[DocumentPayload, PerfSnapshot]>("load_grokedoc", { path });
  return { payload, perf, text: rebuildText(payload) };
}

export function applyContentToEditor(
  root: HTMLElement,
  text: string,
  assets: AssetRef[],
): void {
  root.innerHTML = "";
  const lines = text.split("\n");

  for (const line of lines) {
    const paragraph = createParagraphElement();
    const segments = splitLineByImageTokens(line);

    for (const seg of segments) {
      if (seg.type === "text") {
        const textNode = document.createTextNode(seg.value);
        paragraph.appendChild(textNode);
      } else {
        const imgBlock = createImageBlockElement(
          seg.name ?? "",
          seg.alt ?? seg.name ?? "",
          seg.width,
          seg.height,
        );
        const img = imgBlock.querySelector("img");
        if (img) {
          const asset = assets.find((a) => a.name === (seg.name ?? ""));
          const dataUrl = asset ? assetToDataUrl(asset) : null;
          if (dataUrl) img.src = dataUrl;
        }
        paragraph.appendChild(imgBlock);
      }
    }
    root.appendChild(paragraph);
  }

  if (root.childNodes.length === 0) {
    const p = createParagraphElement();
    p.innerHTML = "<br>";
    root.appendChild(p);
  }
}

export function applyLoadedPayload(root: HTMLElement, payload: DocumentPayload): void {
  applyContentToEditor(root, rebuildText(payload), payload.assets ?? []);

  const ranges = payload.metadata?.ranges;
  if (ranges?.length) {
    applyMetadataRanges(root, ranges);
  }
}

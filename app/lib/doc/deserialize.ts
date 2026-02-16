import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
} from "lexical";
import { invoke } from "@tauri-apps/api/core";

import { $createImageNode } from "~/components/editor/nodes/ImageNode";
import { applyMetadataRanges } from "./applyRanges";
import { splitLineByImageTokens } from "./imageToken";
import type { AssetRef, DocumentPayload, PerfSnapshot } from "./schema";

const MAX_TEXT_NODE_CHARS = 2048;

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
  editor: LexicalEditor,
  text: string,
  assets: AssetRef[],
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const lines = text.split("\n");

    for (const line of lines) {
      const paragraph = $createParagraphNode();
      const segments = splitLineByImageTokens(line);

      for (const seg of segments) {
        if (seg.type === "text") {
          if (seg.value.length === 0) {
            paragraph.append($createTextNode(""));
          } else {
            for (let offset = 0; offset < seg.value.length; offset += MAX_TEXT_NODE_CHARS) {
              const chunk = seg.value.slice(offset, offset + MAX_TEXT_NODE_CHARS);
              paragraph.append($createTextNode(chunk));
            }
          }
        } else {
          paragraph.append(
            $createImageNode({
              assetName: seg.name ?? "",
              alt: seg.alt ?? seg.name ?? "",
              width: seg.width,
              height: seg.height,
            }),
          );
        }
      }
      root.append(paragraph);
    }
  });
}

export function applyLoadedPayload(editor: LexicalEditor, payload: DocumentPayload): void {
  applyContentToEditor(editor, rebuildText(payload), payload.assets ?? []);

  const ranges = payload.metadata?.ranges;
  if (ranges?.length) {
    applyMetadataRanges(editor, ranges);
  }
}

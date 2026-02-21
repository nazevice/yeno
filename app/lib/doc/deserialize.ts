import { invoke } from "@tauri-apps/api/core";

import type { DocumentPayload, PerfSnapshot } from "./schema";
import { EditorEngine } from "./editorEngine";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadDocument(path: string): Promise<{
  payload: DocumentPayload;
  perf: PerfSnapshot;
}> {
  if (!isTauriRuntime()) {
    throw new Error("Open operation is available in Tauri desktop runtime.");
  }

  const [payload, perf] = await invoke<[DocumentPayload, PerfSnapshot]>("load_grokedoc", { path });
  return { payload, perf };
}

export function createEngineFromPayload(payload: DocumentPayload): EditorEngine {
  const { documentTree } = payload;
  if (!documentTree || documentTree.version !== 2) {
    throw new Error("Invalid document format (missing or invalid documentTree)");
  }
  const content = {
    baseText: payload.baseText,
    chunks: payload.chunks,
  };
  return new EditorEngine(documentTree, content);
}

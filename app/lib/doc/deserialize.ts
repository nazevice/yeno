import { invoke } from "@tauri-apps/api/core";
import type { DocumentPayload, PerfSnapshot } from "./schema";

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

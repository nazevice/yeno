import type { DocumentRepository, VersionSummary } from "../../domain/document/DocumentRepository";
import type { DocumentId } from "../../domain/shared/NodeId";
import { Document } from "../../domain/document/Document";
import { DocumentMapper } from "./DocumentMapper";
import type { DocumentPayload } from "./types";

export class TauriDocumentRepository implements DocumentRepository {
  async findById(id: DocumentId): Promise<Document | null> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const payload = await invoke<DocumentPayload>("load_grokedoc", {
        path: `documents/${id}.grokedoc`,
      });
      return DocumentMapper.toDomain(payload);
    } catch {
      return null;
    }
  }

  async save(document: Document): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = DocumentMapper.toPayload(document);
    await invoke("save_grokedoc", {
      path: `documents/${document.id}.grokedoc`,
      payload,
    });
  }

  async delete(id: DocumentId): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_document", {
      path: `documents/${id}.grokedoc`,
    });
  }

  async listVersions(id: DocumentId): Promise<VersionSummary[]> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<VersionSummary[]>("list_versions", {
        path: `documents/${id}.grokedoc`,
      });
    } catch {
      return [];
    }
  }
}

import type { DocumentId } from "../shared/NodeId";
import type { Document } from "./Document";
import type { DocumentSnapshot } from "./DocumentSnapshot";

export interface VersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  label?: string | undefined;
  contentHash: string;
  charCount: number;
  lineCount: number;
}

export interface DocumentRepository {
  findById(id: DocumentId): Promise<Document | null>;
  save(document: Document): Promise<void>;
  delete(id: DocumentId): Promise<void>;
  listVersions(id: DocumentId): Promise<VersionSummary[]>;
}

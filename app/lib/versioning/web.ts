/**
 * Web implementation of document versioning using IndexedDB.
 * Used when running in browser (non-Tauri) with WASM for diff.
 */

import { initialize, diffVersionsStructured } from '~/lib/wasm';
import type {
  DocumentVersion,
  VersionSummary,
  VersionDiff,
  CreateVersionResponse,
  ListVersionsResponse,
  GetVersionResponse,
  DeleteVersionResponse,
} from './types';

const DB_NAME = 'yeno_versions';
const DB_VERSION = 1;
const STORE_NAME = 'versions';

function getDocumentId(path: string): string {
  const trimmed = path?.trim() || '';
  return trimmed || 'default';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
      }
    };
  });
}

interface StoredVersions {
  documentId: string;
  versions: DocumentVersion[];
}

async function getStoredVersions(documentId: string): Promise<DocumentVersion[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(documentId);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      const data = request.result as StoredVersions | undefined;
      resolve(data?.versions ?? []);
    };
  });
}

async function saveVersions(documentId: string, versions: DocumentVersion[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ documentId, versions });
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function createDocumentVersion(
  versionNumber: number,
  content: string,
  label?: string
): Omit<DocumentVersion, 'metadata'> & { metadata: { baseText: string; chunks: unknown[] } } {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  return {
    id,
    versionNumber,
    createdAt,
    label,
    contentHash: '', // set async
    content,
    metadata: {
      baseText: content,
      chunks: [{ type: 'original' as const, offset: 0, len: content.length, source: 'baseText' }],
    },
  };
}

async function createVersionWithHash(
  versionNumber: number,
  content: string,
  label?: string
): Promise<DocumentVersion> {
  const version = createDocumentVersion(versionNumber, content, label);
  version.contentHash = await sha256Hex(content);
  return version as DocumentVersion;
}

function toSummary(v: DocumentVersion): VersionSummary {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    createdAt: v.createdAt,
    label: v.label,
    contentHash: v.contentHash,
    charCount: v.content.length,
    lineCount: v.content.split('\n').length,
  };
}

function findVersion(versions: DocumentVersion[], versionId: string): DocumentVersion | null {
  return versions.find((v) => v.id === versionId) ?? null;
}

export async function webCreateVersion(
  path: string,
  content: string,
  label?: string
): Promise<CreateVersionResponse> {
  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);

  const nextVersionNumber =
    versions.length > 0 ? Math.max(...versions.map((v) => v.versionNumber)) + 1 : 1;
  const version = await createVersionWithHash(nextVersionNumber, content, label);

  versions.push(version);
  await saveVersions(documentId, versions);

  return {
    version,
    allVersions: versions.map(toSummary),
  };
}

export async function webListVersions(path: string): Promise<ListVersionsResponse> {
  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);
  const summaries = versions.map(toSummary);
  const currentVersionNumber =
    summaries.length > 0 ? Math.max(...summaries.map((s) => s.versionNumber)) : 0;

  return {
    versions: summaries,
    currentVersionNumber,
  };
}

export async function webGetVersion(path: string, versionId: string): Promise<GetVersionResponse> {
  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);
  const version = findVersion(versions, versionId);

  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }

  return { version };
}

export async function webDiffVersions(
  path: string,
  fromVersionId: string,
  toVersionId: string
): Promise<VersionDiff> {
  await initialize();

  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);
  const fromVersion = findVersion(versions, fromVersionId);
  const toVersion = findVersion(versions, toVersionId);

  if (!fromVersion) {
    throw new Error(`Version not found: ${fromVersionId}`);
  }
  if (!toVersion) {
    throw new Error(`Version not found: ${toVersionId}`);
  }

  const result = diffVersionsStructured(
    fromVersion.content,
    toVersion.content,
    fromVersionId,
    toVersionId
  );

  return result as VersionDiff;
}

export async function webRestoreVersion(path: string, versionId: string): Promise<CreateVersionResponse> {
  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);
  const targetVersion = findVersion(versions, versionId);

  if (!targetVersion) {
    throw new Error(`Version not found: ${versionId}`);
  }

  const nextVersionNumber =
    versions.length > 0 ? Math.max(...versions.map((v) => v.versionNumber)) + 1 : 1;
  const label = `Restored from version ${targetVersion.versionNumber}`;
  const restored = await createVersionWithHash(
    nextVersionNumber,
    targetVersion.content,
    label
  );

  versions.push(restored);
  await saveVersions(documentId, versions);

  return {
    version: restored,
    allVersions: versions.map(toSummary),
  };
}

export async function webDeleteVersion(
  path: string,
  versionId: string
): Promise<DeleteVersionResponse> {
  const documentId = getDocumentId(path);
  const versions = await getStoredVersions(documentId);
  const beforeLen = versions.length;
  const filtered = versions.filter((v) => v.id !== versionId);

  if (filtered.length === beforeLen) {
    throw new Error(`Version not found: ${versionId}`);
  }

  await saveVersions(documentId, filtered);

  return {
    versions: filtered.map(toSummary),
  };
}

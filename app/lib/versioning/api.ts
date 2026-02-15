/**
 * Document Versioning API
 *
 * Provides functions for creating, listing, comparing, and restoring
 * document versions. Uses Tauri commands on desktop, IndexedDB + WASM on web.
 */

import { invoke } from '@tauri-apps/api/core';

import {
  webCreateVersion,
  webListVersions,
  webGetVersion,
  webDiffVersions,
  webRestoreVersion,
  webDeleteVersion,
} from './web';
import type {
  CreateVersionRequest,
  CreateVersionResponse,
  ListVersionsResponse,
  GetVersionResponse,
  DiffVersionsRequest,
  VersionDiff,
  RestoreVersionRequest,
  DeleteVersionRequest,
  DeleteVersionResponse,
  DocumentVersion,
  VersionSummary,
  DiffHunk,
  DiffLine,
  DiffLineKind,
} from './types';

/**
 * Check if running in Tauri runtime.
 */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Create a new version of the document.
 * 
 * Captures the current state without modifying the working content.
 * 
 * @param path - Path to the document file
 * @param content - Current document content
 * @param label - Optional label for this version
 * @returns The created version and updated version list
 */
export async function createVersion(
  path: string,
  content: string,
  label?: string
): Promise<CreateVersionResponse> {
  if (!isTauriRuntime()) {
    return webCreateVersion(path, content, label);
  }

  return invoke<CreateVersionResponse>('create_version', {
    request: { path, content, label } satisfies CreateVersionRequest,
  });
}

/**
 * List all versions of a document.
 * 
 * @param path - Path to the document file
 * @returns Version summaries and current version number
 */
export async function listVersions(path: string): Promise<ListVersionsResponse> {
  if (!isTauriRuntime()) {
    return webListVersions(path);
  }

  return invoke<ListVersionsResponse>('list_versions', { path });
}

/**
 * Get a specific version by ID.
 * 
 * @param path - Path to the document file
 * @param versionId - The version's unique ID
 * @returns The full version including content
 */
export async function getVersion(path: string, versionId: string): Promise<GetVersionResponse> {
  if (!isTauriRuntime()) {
    return webGetVersion(path, versionId);
  }

  return invoke<GetVersionResponse>('get_version', { path, versionId });
}

/**
 * Compare two versions and return the diff.
 * 
 * @param path - Path to the document file
 * @param fromVersionId - Source version ID
 * @param toVersionId - Target version ID
 * @returns Structured diff between versions
 */
export async function diffVersions(
  path: string,
  fromVersionId: string,
  toVersionId: string
): Promise<VersionDiff> {
  if (!isTauriRuntime()) {
    return webDiffVersions(path, fromVersionId, toVersionId);
  }

  return invoke<VersionDiff>('diff_versions', {
    request: { path, fromVersionId, toVersionId } satisfies DiffVersionsRequest,
  });
}

/**
 * Restore the document to a previous version.
 * 
 * Creates a new version with the restored content.
 * 
 * @param path - Path to the document file
 * @param versionId - The version to restore
 * @returns The new restored version and updated version list
 */
export async function restoreVersion(
  path: string,
  versionId: string
): Promise<CreateVersionResponse> {
  if (!isTauriRuntime()) {
    return webRestoreVersion(path, versionId);
  }

  return invoke<CreateVersionResponse>('restore_version', {
    request: { path, versionId } satisfies RestoreVersionRequest,
  });
}

/**
 * Delete a specific version.
 * 
 * @param path - Path to the document file
 * @param versionId - The version to delete
 * @returns Updated version list
 */
export async function deleteVersion(
  path: string,
  versionId: string
): Promise<DeleteVersionResponse> {
  if (!isTauriRuntime()) {
    return webDeleteVersion(path, versionId);
  }

  return invoke<DeleteVersionResponse>('delete_version', {
    request: { path, versionId } satisfies DeleteVersionRequest,
  });
}

// Re-export types
export type {
  DocumentVersion,
  VersionSummary,
  VersionDiff,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  CreateVersionResponse,
  ListVersionsResponse,
  GetVersionResponse,
  DeleteVersionResponse,
};

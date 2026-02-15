/**
 * Document Versioning Module
 * 
 * Provides version control for documents with create, list, diff, and restore capabilities.
 */

export {
  createVersion,
  listVersions,
  getVersion,
  diffVersions,
  restoreVersion,
  deleteVersion,
} from './api';

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
  CreateVersionRequest,
  DiffVersionsRequest,
  RestoreVersionRequest,
  DeleteVersionRequest,
} from './types';

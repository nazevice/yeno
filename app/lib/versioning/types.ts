/**
 * TypeScript types for document versioning.
 * Mirrors the Rust types in src-tauri/src/model/version.rs
 */

// ============================================================================
// Version Types
// ============================================================================

/**
 * A snapshot of a document at a specific point in time.
 */
export interface DocumentVersion {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Version number (sequential, 1-indexed) */
  versionNumber: number;
  /** ISO 8601 timestamp when version was created */
  createdAt: string;
  /** User-provided label for this version */
  label?: string;
  /** SHA-256 hash of the content */
  contentHash: string;
  /** The text content at this version */
  content: string;
  /** Formatting metadata */
  metadata: VersionMetadata;
}

/**
 * Summary of a version for list display (without full content).
 */
export interface VersionSummary {
  id: string;
  versionNumber: number;
  createdAt: string;
  label?: string;
  contentHash: string;
  /** Character count at this version */
  charCount: number;
  /** Line count at this version */
  lineCount: number;
}

/**
 * Simplified piece table content for version metadata.
 */
export interface VersionMetadata {
  baseText: string;
  chunks: Array<{
    type: 'original' | 'insert' | 'delete';
    offset?: number;
    len?: number;
    source?: string;
    pos?: number;
    data?: string;
  }>;
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * Result of comparing two versions.
 */
export interface VersionDiff {
  /** Source version ID */
  fromVersionId: string;
  /** Target version ID */
  toVersionId: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
  /** Number of unchanged lines */
  unchanged: number;
  /** Similarity ratio (0.0 to 1.0) */
  similarity: number;
  /** Unified diff output */
  unifiedDiff: string;
  /** Structured hunks for UI rendering */
  hunks: DiffHunk[];
}

/**
 * A single hunk in the diff.
 */
export interface DiffHunk {
  /** Header line (e.g., "@@ -1,5 +1,6 @@") */
  header: string;
  /** Old file start line */
  oldStart: number;
  /** Old file line count */
  oldLines: number;
  /** New file start line */
  newStart: number;
  /** New file line count */
  newLines: number;
  /** Lines in this hunk */
  lines: DiffLine[];
}

/**
 * Type of change for a diff line.
 */
export type DiffLineKind = 'context' | 'addition' | 'deletion';

/**
 * A single line in a diff hunk.
 */
export interface DiffLine {
  /** Type of change */
  kind: DiffLineKind;
  /** The line content (without prefix character) */
  content: string;
  /** Line number in old file (null for additions) */
  oldLine: number | null;
  /** Line number in new file (null for deletions) */
  newLine: number | null;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateVersionRequest {
  path: string;
  content: string;
  label?: string;
}

export interface CreateVersionResponse {
  version: DocumentVersion;
  allVersions: VersionSummary[];
}

export interface ListVersionsResponse {
  versions: VersionSummary[];
  currentVersionNumber: number;
}

export interface GetVersionResponse {
  version: DocumentVersion;
}

export interface DiffVersionsRequest {
  path: string;
  fromVersionId: string;
  toVersionId: string;
}

export interface RestoreVersionRequest {
  path: string;
  versionId: string;
}

export interface DeleteVersionRequest {
  path: string;
  versionId: string;
}

export interface DeleteVersionResponse {
  versions: VersionSummary[];
}

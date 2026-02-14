/**
 * TypeScript type definitions for the Yeno WASM module.
 * 
 * These types provide compile-time safety when working with WASM exports.
 */

// ============================================================================
// Compression Types
// ============================================================================

/**
 * Result of a compression operation.
 */
export interface CompressResult {
  /** Compressed data as Uint8Array */
  data: Uint8Array;
  /** Original uncompressed size in bytes */
  original_size: number;
  /** Compressed size in bytes */
  compressed_size: number;
  /** Compression ratio (compressed / original) */
  ratio: number;
}

/**
 * Compression module API
 */
export interface CompressModule {
  /** Compress binary data */
  compress(input: Uint8Array): CompressResult;
  /** Decompress binary data */
  decompress(input: Uint8Array): Uint8Array;
  /** Compress a UTF-8 string */
  compress_string(input: string): CompressResult;
  /** Decompress to a UTF-8 string */
  decompress_to_string(input: Uint8Array): string;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * A single search match.
 */
export interface SearchMatch {
  /** Start position of the match (byte offset) */
  start: number;
  /** End position of the match (exclusive) */
  end: number;
  /** The matched text */
  text: string;
}

/**
 * Result of a search operation.
 */
export interface SearchResult {
  /** Array of all matches */
  matches: SearchMatch[];
  /** Total number of matches found */
  count: number;
  /** Search pattern used */
  pattern: string;
  /** Whether the search was case-sensitive */
  case_sensitive: boolean;
}

/**
 * Multi-pattern search result (pattern -> SearchResult)
 */
export type MultiSearchResult = Record<string, {
  matches: SearchMatch[];
  count: number;
}>;

/**
 * Search module API
 */
export interface SearchModule {
  /** Search for exact substring matches */
  search(text: string, pattern: string, case_sensitive: boolean): SearchResult;
  /** Search using a regular expression */
  search_regex(text: string, pattern: string, case_sensitive: boolean): SearchResult;
  /** Search for multiple patterns at once */
  search_multi(text: string, patterns: string[], case_sensitive: boolean): MultiSearchResult;
  /** Check if a regex pattern is valid */
  is_valid_regex(pattern: string): boolean;
}

// ============================================================================
// CRDT Types
// ============================================================================

/**
 * Handle to a CRDT text type.
 */
export interface TextHandle {
  /** Insert text at a given position */
  insert(doc: DocState, index: number, text: string): void;
  /** Delete characters from a given position */
  delete(doc: DocState, index: number, length: number): void;
  /** Get the current text content */
  get_text(doc: DocState): string;
  /** Get the length of the text */
  length(doc: DocState): number;
}

/**
 * Handle to a CRDT map type.
 */
export interface MapHandle {
  /** Set a key-value pair */
  set(doc: DocState, key: string, value: string): void;
  /** Get a value by key */
  get(doc: DocState, key: string): string | undefined;
  /** Delete a key */
  delete(doc: DocState, key: string): void;
  /** Get all keys */
  keys(doc: DocState): string[];
  /** Get the number of entries */
  length(doc: DocState): number;
}

/**
 * CRDT document state.
 */
export interface DocState {
  /** Get the document's current state vector */
  state_vector(): Uint8Array;
  /** Get the full document state as binary */
  encode_state(): Uint8Array;
  /** Apply a binary update to this document */
  apply_update(update: Uint8Array): void;
  /** Check if this document has seen all updates from the given state vector */
  has_state(sv: Uint8Array): boolean;
  /** Get the missing updates needed to sync with the given state vector */
  get_missing(sv: Uint8Array): Uint8Array;
  /** Create a text type within this document */
  create_text(name: string): TextHandle;
  /** Create a map type within this document */
  create_map(name: string): MapHandle;
}

/**
 * CRDT module API
 */
export interface CrdtModule {
  /** Create a new empty CRDT document */
  create_doc(): DocState;
  /** Apply a binary update to a document and return the updated document */
  apply_update(doc: DocState, update: Uint8Array): DocState;
  /** Encode a document's state to binary */
  encode_state(doc: DocState): Uint8Array;
  /** Decode binary state into a new document */
  decode_state(state: Uint8Array): DocState;
  /** Merge two state vectors */
  merge_state_vectors(sv1: Uint8Array, sv2: Uint8Array): Uint8Array;
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * Diff operation type.
 */
export const DiffOp = {
  Insert: 0,
  Delete: 1,
  Equal: 2,
} as const;

export type DiffOpType = typeof DiffOp[keyof typeof DiffOp];

/**
 * A single change in the diff.
 */
export interface DiffHunk {
  /** The operation type */
  op: DiffOpType;
  /** The text content */
  text: string;
  /** Starting line number in original text */
  oldStart: number;
  /** Number of lines in original text */
  oldLines: number;
  /** Starting line number in new text */
  newStart: number;
  /** Number of lines in new text */
  newLines: number;
}

/**
 * Result of a diff operation.
 */
export interface DiffResult {
  /** Array of diff hunks */
  hunks: DiffHunk[];
  /** Total number of hunks */
  count: number;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** Number of unchanged lines */
  unchanged: number;
  /** Similarity ratio (0.0 to 1.0) */
  similarity: number;
}

/**
 * Diff module API
 */
export interface DiffModule {
  /** Compute line-level diff */
  diff(old_text: string, new_text: string): DiffResult;
  /** Compute character-level diff */
  diff_chars(old_text: string, new_text: string): DiffResult;
  /** Compute word-level diff */
  diff_words(old_text: string, new_text: string): DiffResult;
  /** Check if two texts are identical */
  texts_equal(old_text: string, new_text: string): boolean;
  /** Get a unified diff string */
  unified_diff(
    old_text: string,
    new_text: string,
    old_name: string,
    new_name: string,
    context_lines: number
  ): string;
}

// ============================================================================
// Main Module Type
// ============================================================================

/**
 * Main WASM module API.
 */
export interface YenoWasm extends CompressModule, SearchModule, CrdtModule, DiffModule {
  /** Initialize the WASM module */
  init(): void;
  /** Get the version of the WASM module */
  version(): string;
  /** Check if the WASM module is properly initialized */
  is_initialized(): boolean;
}

/**
 * Factory function type for loading the WASM module.
 */
export type YenoWasmFactory = () => Promise<YenoWasm>;

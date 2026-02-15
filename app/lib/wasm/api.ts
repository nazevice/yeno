/**
 * Yeno WASM API
 * 
 * High-level API for WASM operations with automatic worker pool management.
 * Provides both synchronous (main thread) and asynchronous (worker) operations.
 */

import { loadWasm, getWasm } from './loader';
import { getWorkerPool, initializeWorkerPool } from './worker-pool';
import type {
  CompressResult,
  SearchResult,
  MultiSearchResult,
  DiffResult,
  DocState,
  VersionDiffResult,
} from './types';

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the WASM module and worker pool.
 * 
 * Call this early in your application lifecycle.
 */
export async function initialize(): Promise<void> {
  await Promise.all([
    loadWasm(),
    initializeWorkerPool(),
  ]);
}

/**
 * Check if the WASM module is loaded and ready.
 */
export function isReady(): boolean {
  return getWasm() !== null;
}

// ============================================================================
// Compression API
// ============================================================================

/**
 * Compress binary data using LZ4.
 * 
 * Runs on main thread for low latency on small data.
 */
export function compress(data: Uint8Array): CompressResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.compress(data);
}

/**
 * Compress binary data asynchronously using worker pool.
 * 
 * Use for large data to avoid blocking the main thread.
 */
export async function compressAsync(data: Uint8Array): Promise<CompressResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'compress', data });
}

/**
 * Decompress LZ4 compressed data.
 */
export function decompress(data: Uint8Array): Uint8Array {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.decompress(data);
}

/**
 * Decompress data asynchronously using worker pool.
 */
export async function decompressAsync(data: Uint8Array): Promise<Uint8Array> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'decompress', data });
}

/**
 * Compress a string to LZ4 binary data.
 */
export function compressString(text: string): CompressResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.compress_string(text);
}

/**
 * Compress a string asynchronously.
 */
export async function compressStringAsync(text: string): Promise<CompressResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'compress_string', text });
}

/**
 * Decompress LZ4 data to a string.
 */
export function decompressToString(data: Uint8Array): string {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.decompress_to_string(data);
}

/**
 * Decompress to string asynchronously.
 */
export async function decompressToStringAsync(data: Uint8Array): Promise<string> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'decompress_to_string', data });
}

// ============================================================================
// Search API
// ============================================================================

/**
 * Search for exact substring matches.
 */
export function search(
  text: string,
  pattern: string,
  caseSensitive = false
): SearchResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.search(text, pattern, caseSensitive);
}

/**
 * Search asynchronously using worker pool.
 */
export async function searchAsync(
  text: string,
  pattern: string,
  caseSensitive = false
): Promise<SearchResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'search', text, pattern, caseSensitive });
}

/**
 * Search using a regular expression.
 */
export function searchRegex(
  text: string,
  pattern: string,
  caseSensitive = false
): SearchResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.search_regex(text, pattern, caseSensitive);
}

/**
 * Regex search asynchronously.
 */
export async function searchRegexAsync(
  text: string,
  pattern: string,
  caseSensitive = false
): Promise<SearchResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'search_regex', text, pattern, caseSensitive });
}

/**
 * Search for multiple patterns at once.
 */
export function searchMulti(
  text: string,
  patterns: string[],
  caseSensitive = false
): MultiSearchResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.search_multi(text, patterns, caseSensitive);
}

/**
 * Multi-pattern search asynchronously.
 */
export async function searchMultiAsync(
  text: string,
  patterns: string[],
  caseSensitive = false
): Promise<MultiSearchResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'search_multi', text, patterns, caseSensitive });
}

/**
 * Validate a regex pattern.
 */
export function isValidRegex(pattern: string): boolean {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.is_valid_regex(pattern);
}

// ============================================================================
// Diff API
// ============================================================================

/**
 * Compute line-level diff between two texts.
 */
export function diff(oldText: string, newText: string): DiffResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.diff(oldText, newText);
}

/**
 * Diff asynchronously using worker pool.
 */
export async function diffAsync(oldText: string, newText: string): Promise<DiffResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'diff', oldText, newText });
}

/**
 * Compute character-level diff.
 */
export function diffChars(oldText: string, newText: string): DiffResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.diff_chars(oldText, newText);
}

/**
 * Character diff asynchronously.
 */
export async function diffCharsAsync(oldText: string, newText: string): Promise<DiffResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'diff_chars', oldText, newText });
}

/**
 * Compute word-level diff.
 */
export function diffWords(oldText: string, newText: string): DiffResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.diff_words(oldText, newText);
}

/**
 * Word diff asynchronously.
 */
export async function diffWordsAsync(oldText: string, newText: string): Promise<DiffResult> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'diff_words', oldText, newText });
}

/**
 * Generate a unified diff string.
 */
export function unifiedDiff(
  oldText: string,
  newText: string,
  oldName = 'old',
  newName = 'new',
  contextLines = 3
): string {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.unified_diff(oldText, newText, oldName, newName, contextLines);
}

/**
 * Unified diff asynchronously.
 */
export async function unifiedDiffAsync(
  oldText: string,
  newText: string,
  oldName = 'old',
  newName = 'new',
  contextLines = 3
): Promise<string> {
  const pool = getWorkerPool();
  return pool.execute({ type: 'unified_diff', oldText, newText, oldName, newName, contextLines });
}

/**
 * Check if two texts are identical.
 */
export function textsEqual(oldText: string, newText: string): boolean {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.texts_equal(oldText, newText);
}

/**
 * Compute structured diff for version comparison.
 * Returns VersionDiff format for DiffViewer.
 */
export function diffVersionsStructured(
  oldText: string,
  newText: string,
  fromVersionId: string,
  toVersionId: string
): VersionDiffResult {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.diff_versions_structured(oldText, newText, fromVersionId, toVersionId);
}

// ============================================================================
// CRDT API
// ============================================================================

/**
 * Create a new CRDT document.
 */
export function createDoc(): DocState {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.create_doc();
}

/**
 * Apply an update to a document.
 */
export function applyUpdate(doc: DocState, update: Uint8Array): DocState {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.apply_update(doc, update);
}

/**
 * Encode document state to binary.
 */
export function encodeState(doc: DocState): Uint8Array {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.encode_state(doc);
}

/**
 * Decode binary state to a new document.
 */
export function decodeState(state: Uint8Array): DocState {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.decode_state(state);
}

/**
 * Merge two state vectors.
 */
export function mergeStateVectors(sv1: Uint8Array, sv2: Uint8Array): Uint8Array {
  const wasm = getWasm();
  if (!wasm) throw new Error('WASM module not loaded. Call initialize() first.');
  return wasm.merge_state_vectors(sv1, sv2);
}

// ============================================================================
// Re-export Types
// ============================================================================

export type {
  CompressResult,
  SearchMatch,
  SearchResult,
  MultiSearchResult,
  DiffHunk,
  DiffResult,
  DiffOpType,
  VersionDiffResult,
  DocState,
  TextHandle,
  MapHandle,
  YenoWasm,
} from './types';

export { DiffOp } from './types';

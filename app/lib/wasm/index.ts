/**
 * Yeno WASM Module
 * 
 * Provides CPU-intensive operations for the Yeno editor:
 * - LZ4 compression/decompression
 * - Full-text search with regex support
 * - CRDT-based collaborative editing
 * - Patience diff for versioning
 * 
 * @example
 * ```typescript
 * import { initialize, compressString, decompressToString } from '~/lib/wasm';
 * 
 * await initialize();
 * 
 * const compressed = compressString('Hello, World!');
 * console.log(`Compressed to ${compressed.compressed_size} bytes (${compressed.ratio * 100}%)`);
 * 
 * const original = decompressToString(compressed.data);
 * console.log(original); // 'Hello, World!'
 * ```
 */

// High-level API (recommended for most use cases)
export {
  // Initialization
  initialize,
  isReady,
  
  // Compression
  compress,
  compressAsync,
  decompress,
  decompressAsync,
  compressString,
  compressStringAsync,
  decompressToString,
  decompressToStringAsync,
  
  // Search
  search,
  searchAsync,
  searchRegex,
  searchRegexAsync,
  searchMulti,
  searchMultiAsync,
  isValidRegex,
  
  // Diff
  diff,
  diffAsync,
  diffChars,
  diffCharsAsync,
  diffWords,
  diffWordsAsync,
  unifiedDiff,
  unifiedDiffAsync,
  textsEqual,
  
  // CRDT
  createDoc,
  applyUpdate,
  encodeState,
  decodeState,
  mergeStateVectors,
} from './api';

// Types
export type {
  CompressResult,
  SearchMatch,
  SearchResult,
  MultiSearchResult,
  DiffHunk,
  DiffResult,
  DiffOpType,
  DocState,
  TextHandle,
  MapHandle,
  YenoWasm,
} from './api';

export { DiffOp } from './api';

// Low-level APIs (for advanced use cases)
export { loadWasm, getWasm, resetWasm, getWasmVersion, isWasmLoaded } from './loader';
export { WasmWorkerPool, getWorkerPool, initializeWorkerPool, terminateWorkerPool } from './worker-pool';

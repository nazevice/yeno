# Yeno WASM Module

This module provides CPU-intensive operations for the Yeno editor, compiled to WebAssembly for optimal performance.

## Features

- **Compression**: LZ4-based compression for fast document serialization
- **Search**: Full-text search with regex and multi-pattern support
- **CRDT**: Conflict-free replicated data types for collaborative editing
- **Diff**: Patience diff algorithm for document versioning

## Architecture

```
app/lib/wasm/
├── index.ts       # Main entry point with re-exports
├── api.ts         # High-level API functions
├── loader.ts      # WASM module loader
├── types.ts       # TypeScript type definitions
├── worker-pool.ts # Web Worker pool for async operations
└── wasm.worker.ts # Worker script for off-thread execution
```

## Usage

### Initialization

Initialize the WASM module early in your application lifecycle:

```typescript
import { initialize } from '~/lib/wasm';

// In your app entry point
await initialize();
```

### Compression

```typescript
import { compressString, decompressToString, compressStringAsync } from '~/lib/wasm';

// Synchronous (small data)
const result = compressString('Hello, World!');
console.log(`Compressed: ${result.compressed_size} bytes (${(result.ratio * 100).toFixed(1)}%)`);

// Decompress
const original = decompressToString(result.data);

// Async for large data (runs in worker)
const asyncResult = await compressStringAsync(largeDocument);
```

### Search

```typescript
import { search, searchRegex, searchMulti, searchAsync } from '~/lib/wasm';

// Exact substring search
const results = search(text, 'pattern', false); // case-insensitive
console.log(`Found ${results.count} matches`);

// Regex search
const regexResults = searchRegex(text, '\\b\\w+ing\\b', true);

// Multi-pattern search (efficient for multiple patterns)
const multiResults = searchMulti(text, ['error', 'warning', 'info'], true);

// Async for large documents
const asyncResults = await searchAsync(largeText, 'pattern', true);
```

### Diff

```typescript
import { diff, diffChars, diffWords, unifiedDiff, diffAsync } from '~/lib/wasm';

// Line-level diff
const lineDiff = diff(oldText, newText);
console.log(`+${lineDiff.insertions} -${lineDiff.deletions} ~${lineDiff.unchanged}`);

// Character-level diff (for inline changes)
const charDiff = diffChars(oldText, newText);

// Word-level diff (for prose)
const wordDiff = diffWords(oldText, newText);

// Unified diff format (for patches)
const patch = unifiedDiff(oldText, newText, 'original.txt', 'modified.txt', 3);
```

### CRDT (Collaborative Editing)

```typescript
import { createDoc, encodeState, decodeState, applyUpdate } from '~/lib/wasm';

// Create a document
const doc = createDoc();
const text = doc.create_text('content');
text.insert(doc, 0, 'Hello, World!');

// Encode state for storage
const encoded = encodeState(doc);

// Later, restore from storage
const restored = decodeState(encoded);

// Sync between clients
const stateVector = doc.state_vector();
// Send stateVector to peer, receive their state vector
const missing = doc.get_missing(peerStateVector);
// Send missing to peer
```

## API Reference

### Synchronous vs Asynchronous

All operations have both sync and async variants:

- **Sync**: `compress()`, `search()`, `diff()` - use for small data
- **Async**: `compressAsync()`, `searchAsync()`, `diffAsync()` - use for large data

Async operations run in a Web Worker pool, keeping the main thread responsive.

### Error Handling

All functions throw descriptive errors if the WASM module is not initialized:

```typescript
import { initialize, compressString } from '~/lib/wasm';

try {
  // Always initialize first
  await initialize();
  
  const result = compressString('data');
} catch (error) {
  console.error('WASM error:', error);
}
```

## Building

Prerequisites:
- Rust 1.77+
- wasm-pack: `cargo install wasm-pack`

Build commands:
```bash
# Production build
npm run wasm:build

# Development build (faster, larger)
npm run wasm:dev
```

## Performance

| Operation | Size | Sync | Async (Worker) |
|-----------|------|------|----------------|
| Compress  | 1MB  | ~5ms | ~8ms + transfer |
| Search    | 1MB  | ~2ms | ~5ms + transfer |
| Diff      | 1MB  | ~3ms | ~6ms + transfer |

Worker overhead is ~1-3ms for data transfer. Use sync for small data (< 100KB).

## Memory Management

The WASM module manages its own memory. For large operations:

1. Use async variants to avoid blocking
2. Process data in chunks if possible
3. Let garbage collection run between operations

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

Requires WebAssembly and Web Workers support.

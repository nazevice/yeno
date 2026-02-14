# Yeno WASM Features

This document tracks the WASM-based CPU-intensive features for the Yeno editor.

## Status Overview

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| WASM Infrastructure | Done | High | Loader, worker pool, types |
| LZ4 Compression | Done | High | For .grokedoc format |
| Full-Text Search | Done | Medium | Regex + multi-pattern |
| CRDT (Collaborative) | Done | Medium | Yrs bindings |
| Diff (Versioning) | Done | Medium | Patience diff |

---

## 1. WASM Infrastructure

**Location:** `app/lib/wasm/`

### Files

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript definitions for all WASM exports |
| `loader.ts` | Lazy loading with singleton pattern |
| `worker-pool.ts` | Web Worker pool for async operations |
| `wasm.worker.ts` | Worker script for off-thread execution |
| `api.ts` | High-level API with sync/async variants |
| `index.ts` | Main entry point |

### Build

```bash
# Prerequisites
cargo install wasm-pack

# Development build (faster, larger)
npm run wasm:dev

# Production build
npm run wasm:build
```

### Output

Built files go to `public/wasm/`:
- `yeno_wasm.js` - JavaScript glue code
- `yeno_wasm_bg.wasm` - WebAssembly binary
- `yeno_wasm.d.ts` - TypeScript declarations

### Usage

```typescript
import { initialize, compressString, search, diff, createDoc } from '~/lib/wasm';

// Initialize early in app lifecycle
await initialize();

// All features are now available
```

---

## 2. LZ4 Compression

**Purpose:** Fast compression for document storage (`.grokedoc` format)

**Rust crate:** `lz4_flex`

### API

```typescript
// Synchronous (small data)
import { compress, decompress, compressString, decompressToString } from '~/lib/wasm';

// Binary data
const result = compress(uint8Array);
const original = decompress(result.data);

// Strings
const result = compressString('document content');
const original = decompressToString(result.data);

// Async (large data, runs in worker)
import { compressAsync, decompressAsync } from '~/lib/wasm';
const result = await compressAsync(largeData);
```

### Result Structure

```typescript
interface CompressResult {
  data: Uint8Array;       // Compressed data
  original_size: number;  // Original bytes
  compressed_size: number; // Compressed bytes
  ratio: number;          // compressed / original
}
```

### Integration Points

- [ ] Update `doc/serialize.ts` to use WASM compression
- [ ] Update `doc/deserialize.ts` to use WASM decompression
- [ ] Update Tauri backend to handle compressed format
- [ ] Add compression level configuration

### Performance

| Data Size | Sync | Async |
|-----------|------|-------|
| 100KB | ~1ms | ~3ms |
| 1MB | ~5ms | ~8ms |
| 10MB | ~50ms | ~55ms |

---

## 3. Full-Text Search

**Purpose:** Fast text search for large documents

**Rust crates:** `regex`, `aho-corasick`

### API

```typescript
import { 
  search,           // Exact substring
  searchRegex,      // Regex pattern
  searchMulti,      // Multiple patterns at once
  isValidRegex,     // Validate regex
  searchAsync       // Async variant
} from '~/lib/wasm';

// Exact match
const results = search(text, 'diagnosis', false); // case-insensitive

// Regex search
const results = searchRegex(text, '\\b\\w+ing\\b', true);

// Multi-pattern (efficient for multiple searches)
const results = searchMulti(text, ['error', 'warning', 'info'], true);

// Validate before searching
if (isValidRegex(pattern)) {
  const results = searchRegex(text, pattern, true);
}
```

### Result Structure

```typescript
interface SearchResult {
  matches: SearchMatch[];
  count: number;
  pattern: string;
  case_sensitive: boolean;
}

interface SearchMatch {
  start: number;  // Start position
  end: number;    // End position (exclusive)
  text: string;   // Matched text
}
```

### Integration Points

- [ ] Add search UI component
- [ ] Implement find-and-replace
- [ ] Add search history
- [ ] Highlight matches in editor

---

## 4. CRDT (Collaborative Editing)

**Purpose:** Conflict-free editing for real-time collaboration

**Rust crate:** `yrs` (Yjs Rust implementation)

### API

```typescript
import { 
  createDoc,
  applyUpdate,
  encodeState,
  decodeState,
  mergeStateVectors
} from '~/lib/wasm';

// Create document
const doc = createDoc();

// Create text type for editing
const text = doc.create_text('content');
text.insert(doc, 0, 'Hello, World!');
text.delete(doc, 7, 6);
const content = text.get_text(doc);

// Create map for metadata
const meta = doc.create_map('metadata');
meta.set(doc, 'author', 'John');
meta.set(doc, 'version', '1.0');

// Sync between clients
const stateVector = doc.state_vector();
const missing = doc.get_missing(peerStateVector);

// Persist state
const encoded = encodeState(doc);
const restored = decodeState(encoded);
```

### Integration Points

- [ ] Design sync protocol (WebSocket/WebRTC)
- [ ] Implement awareness (cursor positions, presence)
- [ ] Add offline support with sync queue
- [ ] Implement undo/redo with CRDT awareness
- [ ] Add conflict resolution UI

### State Sync Flow

```
Client A                    Server                    Client B
   |                          |                          |
   |--- state_vector ------->|                          |
   |                          |--- state_vector ------->|
   |                          |<--- missing_updates ----|
   |<-- missing_updates -----|                          |
   |--- updates ------------>|--- updates ------------>|
   |                          |                          |
```

---

## 5. Diff (Document Versioning)

**Purpose:** Compare document versions, generate patches

**Rust crate:** `similar` (patience diff)

### API

```typescript
import { 
  diff,          // Line-level diff
  diffChars,     // Character-level diff
  diffWords,     // Word-level diff
  unifiedDiff,   // Unified diff format
  textsEqual,    // Quick equality check
  diffAsync      // Async variant
} from '~/lib/wasm';

// Line diff
const result = diff(oldText, newText);
console.log(`+${result.insertions} -${result.deletions}`);

// Character diff (for inline changes)
const result = diffChars(oldText, newText);

// Word diff (for prose)
const result = diffWords(oldText, newText);

// Unified diff (for patches)
const patch = unifiedDiff(oldText, newText, 'v1.txt', 'v2.txt', 3);
```

### Result Structure

```typescript
interface DiffResult {
  hunks: DiffHunk[];
  count: number;
  insertions: number;
  deletions: number;
  unchanged: number;
  similarity: number;  // 0.0 to 1.0
}

interface DiffHunk {
  op: DiffOp;        // 0=Insert, 1=Delete, 2=Equal
  text: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}
```

### Integration Points

- [ ] Add version history panel
- [ ] Implement diff viewer UI
- [ ] Add patch generation/export
- [ ] Implement merge conflict detection
- [ ] Add visual diff highlighting

---

## 6. Future Enhancements

### Planned Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Spell checking | Large dictionary with WASM | Low |
| PDF export | Direct WASM PDF generation | Low |
| Markdown parser | Custom WASM parser | Low |
| Syntax highlighting | Code block highlighting | Low |
| Image processing | Resize, crop, compress | Low |

### Performance Optimizations

- [ ] Add streaming compression for large documents
- [ ] Implement incremental search indexing
- [ ] Add WASM SIMD support where available
- [ ] Implement lazy loading of WASM modules

### Browser Support

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 80+ | Full support |
| Firefox | 78+ | Full support |
| Safari | 14+ | Full support |
| Edge | 80+ | Full support |

---

## 7. Testing

### Rust Tests

```bash
cd wasm/yeno-wasm
cargo test
```

### WASM Tests

```bash
cd wasm/yeno-wasm
wasm-pack test --headless --firefox
```

### Integration Tests

```typescript
// TODO: Add integration tests
describe('WASM Compression', () => {
  it('should compress and decompress correctly', async () => {
    const original = 'Test content';
    const compressed = compressString(original);
    const decompressed = decompressToString(compressed.data);
    expect(decompressed).toBe(original);
  });
});
```

---

## 8. Troubleshooting

### Common Issues

**WASM module not loading**
- Ensure `wasm-pack` is installed
- Run `npm run wasm:build` or `npm run wasm:dev`
- Check browser console for errors
- Verify files exist in `public/wasm/`

**Performance issues**
- Use async variants for large data
- Check worker pool initialization
- Profile with browser dev tools

**Memory issues**
- Process large documents in chunks
- Call `resetWasm()` to clear state
- Check for memory leaks in dev tools

### Debug Mode

```typescript
import { getWasmVersion, isWasmLoaded } from '~/lib/wasm';

console.log('WASM loaded:', isWasmLoaded());
console.log('WASM version:', getWasmVersion());
```

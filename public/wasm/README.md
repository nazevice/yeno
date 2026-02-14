# WASM Module Output

This directory contains the compiled WebAssembly module for Yeno.

## Building

Run the build command from the project root:

```bash
npm run wasm:build
```

Or for development (faster builds, larger output):

```bash
npm run wasm:dev
```

## Output Files

After building, this directory will contain:

- `yeno_wasm.js` - JavaScript glue code (import this)
- `yeno_wasm_bg.wasm` - WebAssembly binary
- `yeno_wasm_bg.wasm.d.ts` - TypeScript declarations
- `yeno_wasm.d.ts` - TypeScript declarations

## Prerequisites

Building requires `wasm-pack`:

```bash
cargo install wasm-pack
```

## Usage

The WASM module is loaded automatically by the application. You don't need
to import from this directory directly. Instead, use the API from:

```typescript
import { initialize, compressString, search, diff } from '~/lib/wasm';

await initialize();
```

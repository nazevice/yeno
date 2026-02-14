#!/bin/bash
# Build script for the Yeno WASM module
# Requires wasm-pack to be installed: cargo install wasm-pack

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
OUTPUT_DIR="$PROJECT_ROOT/public/wasm"

echo "Building Yeno WASM module..."

# Build for web (browser) target
wasm-pack build \
  --target web \
  --out-dir "$OUTPUT_DIR" \
  --release \
  --scope yeno \
  "$SCRIPT_DIR"

echo "WASM module built successfully!"
echo "Output: $OUTPUT_DIR"

//! Yeno WASM Module
//!
//! Provides CPU-intensive operations for the Yeno editor:
//! - LZ4 compression/decompression
//! - Full-text search with regex and substring matching
//! - CRDT-based collaborative editing via Yrs
//! - Patience diff for document versioning

use wasm_bindgen::prelude::*;

mod compress;
mod search;
mod crdt;
mod diff;

// Re-export public APIs
pub use compress::{compress, decompress, CompressResult};
pub use search::{search, search_regex, SearchResult};
pub use crdt::{DocState, create_doc, apply_update, encode_state, decode_state};
pub use diff::{diff, DiffResult, DiffOp};

/// Initialize the WASM module. Must be called before any other functions.
/// Sets up panic hook for better error messages in console.
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// Get the version of the WASM module
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if the WASM module is properly initialized
#[wasm_bindgen]
pub fn is_initialized() -> bool {
    true
}

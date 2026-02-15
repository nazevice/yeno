//! LZ4 Compression Module
//!
//! Provides fast compression/decompression for document storage.
//! LZ4 offers excellent compression speed with reasonable ratios,
//! making it ideal for real-time document saves.

use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;
use lz4_flex::{compress_prepend_size, decompress_size_prepended};

/// Result of a compression operation
#[wasm_bindgen(getter_with_clone)]
pub struct CompressResult {
    /// Compressed data as Uint8Array
    pub data: Uint8Array,
    /// Original uncompressed size in bytes
    pub original_size: usize,
    /// Compressed size in bytes
    pub compressed_size: usize,
    /// Compression ratio (compressed / original)
    pub ratio: f64,
}

/// Compress data using LZ4 algorithm.
///
/// # Arguments
/// * `input` - Uint8Array of data to compress
///
/// # Returns
/// CompressResult containing compressed data and metadata
///
/// # Errors
/// Returns an error string if compression fails
#[wasm_bindgen]
pub fn compress(input: Uint8Array) -> Result<CompressResult, JsValue> {
    let data = input.to_vec();
    let original_size = data.len();
    
    let compressed = compress_prepend_size(&data);
    
    let compressed_size = compressed.len();
    let ratio = if original_size > 0 {
        compressed_size as f64 / original_size as f64
    } else {
        1.0
    };
    
    Ok(CompressResult {
        data: Uint8Array::from(compressed.as_slice()),
        original_size,
        compressed_size,
        ratio,
    })
}

/// Decompress LZ4 compressed data.
///
/// # Arguments
/// * `input` - Uint8Array of LZ4 compressed data (with size header)
///
/// # Returns
/// Uint8Array of decompressed data
///
/// # Errors
/// Returns an error string if decompression fails (invalid data, corrupted, etc.)
#[wasm_bindgen]
pub fn decompress(input: Uint8Array) -> Result<Uint8Array, JsValue> {
    let compressed = input.to_vec();
    
    let decompressed = decompress_size_prepended(&compressed)
        .map_err(|e| JsValue::from_str(&format!("Decompression error: {}", e)))?;
    
    Ok(Uint8Array::from(decompressed.as_slice()))
}

/// Compress a string using LZ4 algorithm.
///
/// # Arguments
/// * `input` - String to compress (UTF-8 encoded)
///
/// # Returns
/// CompressResult containing compressed data and metadata
#[wasm_bindgen]
pub fn compress_string(input: String) -> Result<CompressResult, JsValue> {
    let bytes = input.as_bytes();
    let original_size = bytes.len();
    
    let compressed = compress_prepend_size(bytes);
    
    let compressed_size = compressed.len();
    let ratio = if original_size > 0 {
        compressed_size as f64 / original_size as f64
    } else {
        1.0
    };
    
    Ok(CompressResult {
        data: Uint8Array::from(compressed.as_slice()),
        original_size,
        compressed_size,
        ratio,
    })
}

/// Decompress LZ4 data to a string.
///
/// # Arguments
/// * `input` - Uint8Array of LZ4 compressed data
///
/// # Returns
/// Decompressed UTF-8 string
#[wasm_bindgen]
pub fn decompress_to_string(input: Uint8Array) -> Result<String, JsValue> {
    let compressed = input.to_vec();
    
    let decompressed = decompress_size_prepended(&compressed)
        .map_err(|e| JsValue::from_str(&format!("Decompression error: {}", e)))?;
    
    String::from_utf8(decompressed)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 decode error: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compress_decompress_roundtrip() {
        let input = b"Hello, World! This is a test string for compression.";
        let input_array = Uint8Array::from(input.as_slice());
        
        let result = compress(input_array).unwrap();
        assert!(result.compressed_size > 0);
        
        let decompressed = decompress(result.data).unwrap();
        assert_eq!(decompressed.to_vec(), input.to_vec());
    }

    #[test]
    fn test_compress_string_roundtrip() {
        let input = "Hello, World! This is a test string for compression.";
        
        let result = compress_string(input.to_string()).unwrap();
        assert!(result.ratio < 1.0 || input.len() < 50);
        
        let decompressed = decompress_to_string(result.data).unwrap();
        assert_eq!(decompressed, input);
    }

    #[test]
    fn test_empty_input() {
        let input = Uint8Array::new_with_length(0);
        let result = compress(input).unwrap();
        assert!(result.compressed_size > 0);
    }
}

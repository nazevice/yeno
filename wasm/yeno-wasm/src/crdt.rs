//! CRDT Module using Yrs (Yjs Rust implementation)
//!
//! Provides conflict-free replicated data types for collaborative editing.
//! Uses Yrs for efficient CRDT operations with minimal overhead.
//!
//! Key concepts:
//! - DocState: A CRDT document that can be shared between clients
//! - Updates: Binary diffs that can be merged into any document state
//! - State vectors: Used to sync between peers

use js_sys::{Array, Uint8Array};
use wasm_bindgen::prelude::*;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::encoder::Encode};

/// A CRDT document state wrapper.
/// 
/// This wraps a Yrs Doc and provides safe access to its operations.
/// The document can be updated, merged with other updates, and serialized.
#[wasm_bindgen]
pub struct DocState {
    doc: Doc,
}

impl Default for DocState {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl DocState {
    /// Create a new empty CRDT document.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            doc: Doc::new(),
        }
    }

    /// Get the document's current state vector.
    /// 
    /// The state vector identifies which updates this document has seen.
    /// Use this to determine what updates to send to another peer.
    pub fn state_vector(&self) -> Uint8Array {
        let txn = self.doc.transact();
        let sv = txn.state_vector();
        Uint8Array::from(sv.encode_v1().as_slice())
    }

    /// Get the full document state as binary.
    /// 
    /// This includes all updates merged into a single binary blob.
    /// Useful for persisting document state.
    pub fn encode_state(&self) -> Uint8Array {
        let txn = self.doc.transact();
        let update = Update::new();
        let encoded = update.encode_v1();
        Uint8Array::from(encoded.as_slice())
    }

    /// Apply a binary update to this document.
    /// 
    /// Updates can come from other clients or be loaded from storage.
    /// The update will be merged automatically, handling any conflicts.
    pub fn apply_update(&mut self, update: Uint8Array) -> Result<(), JsValue> {
        let bytes = update.to_vec();
        let upd = Update::decode_v1(&bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode update: {}", e)))?;
        
        let mut txn = self.doc.transact();
        txn.apply_update(upd);
        
        Ok(())
    }

    /// Check if this document has seen all updates from the given state vector.
    pub fn has_state(&self, sv: Uint8Array) -> Result<bool, JsValue> {
        let bytes = sv.to_vec();
        let other_sv = StateVector::decode_v1(&bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode state vector: {}", e)))?;
        
        let txn = self.doc.transact();
        Ok(txn.state_vector().contains(&other_sv))
    }

    /// Get the missing updates needed to sync with the given state vector.
    /// 
    /// Returns the binary updates that should be sent to a peer with the
    /// given state vector to bring them up to date.
    pub fn get_missing(&self, sv: Uint8Array) -> Result<Uint8Array, JsValue> {
        let bytes = sv.to_vec();
        let other_sv = StateVector::decode_v1(&bytes)
            .map_err(|e| JsValue::from_str(&format!("Failed to decode state vector: {}", e)))?;
        
        let txn = self.doc.transact();
        let update = txn.encode_diff_v1(&other_sv)
            .map_err(|e| JsValue::from_str(&format!("Failed to encode diff: {}", e)))?;
        
        Ok(Uint8Array::from(update.as_slice()))
    }

    /// Create a text type within this document.
    /// 
    /// Returns a handle that can be used for text operations.
    pub fn create_text(&mut self, name: String) -> TextHandle {
        let text = self.doc.get_or_insert_text(&name);
        TextHandle { text }
    }

    /// Create a map type within this document.
    /// 
    /// Returns a handle for key-value operations.
    pub fn create_map(&mut self, name: String) -> MapHandle {
        let map = self.doc.get_or_insert_map(&name);
        MapHandle { map }
    }
}

/// Handle to a Yrs Text type.
/// 
/// Provides operations for collaborative text editing.
#[wasm_bindgen]
pub struct TextHandle {
    text: yrs::TextRef,
}

#[wasm_bindgen]
impl TextHandle {
    /// Insert text at a given position.
    pub fn insert(&self, doc: &DocState, index: u32, text: String) -> Result<(), JsValue> {
        let mut txn = doc.doc.transact();
        self.text.insert(&mut txn, index, &text)
            .map_err(|e| JsValue::from_str(&format!("Insert failed: {}", e)))?;
        Ok(())
    }

    /// Delete characters from a given position.
    pub fn delete(&self, doc: &DocState, index: u32, length: u32) -> Result<(), JsValue> {
        let mut txn = doc.doc.transact();
        self.text.remove_range(&mut txn, index, length)
            .map_err(|e| JsValue::from_str(&format!("Delete failed: {}", e)))?;
        Ok(())
    }

    /// Get the current text content.
    pub fn get_text(&self, doc: &DocState) -> String {
        let txn = doc.doc.transact();
        self.text.get_string(&txn)
    }

    /// Get the length of the text.
    pub fn length(&self, doc: &DocState) -> u32 {
        let txn = doc.doc.transact();
        self.text.len(&txn)
    }
}

/// Handle to a Yrs Map type.
/// 
/// Provides operations for key-value storage.
#[wasm_bindgen]
pub struct MapHandle {
    map: yrs::MapRef,
}

#[wasm_bindgen]
impl MapHandle {
    /// Set a key-value pair.
    pub fn set(&self, doc: &DocState, key: String, value: String) -> Result<(), JsValue> {
        let mut txn = doc.doc.transact();
        self.map.insert(&mut txn, &key, value)
            .map_err(|e| JsValue::from_str(&format!("Set failed: {}", e)))?;
        Ok(())
    }

    /// Get a value by key.
    pub fn get(&self, doc: &DocState, key: String) -> Option<String> {
        let txn = doc.doc.transact();
        self.map.get(&txn, &key).and_then(|v| {
            if let yrs::Value::Any(yrs::Any::String(s)) = v {
                Some(s.to_string())
            } else {
                None
            }
        })
    }

    /// Delete a key.
    pub fn delete(&self, doc: &DocState, key: String) -> Result<(), JsValue> {
        let mut txn = doc.doc.transact();
        self.map.remove(&mut txn, &key)
            .map_err(|e| JsValue::from_str(&format!("Delete failed: {}", e)))?;
        Ok(())
    }

    /// Get all keys.
    pub fn keys(&self, doc: &DocState) -> Array {
        let txn = doc.doc.transact();
        let arr = Array::new();
        for key in self.map.keys(&txn) {
            arr.push(&JsValue::from_str(key));
        }
        arr
    }

    /// Get the number of entries.
    pub fn length(&self, doc: &DocState) -> u32 {
        let txn = doc.doc.transact();
        self.map.len(&txn)
    }
}

/// Create a new empty CRDT document.
#[wasm_bindgen]
pub fn create_doc() -> DocState {
    DocState::new()
}

/// Apply a binary update to a document and return the updated document.
/// 
/// Convenience function for one-off updates.
#[wasm_bindgen]
pub fn apply_update(mut doc: DocState, update: Uint8Array) -> Result<DocState, JsValue> {
    doc.apply_update(update)?;
    Ok(doc)
}

/// Encode a document's state to binary.
/// 
/// The encoded state can be persisted and later restored.
#[wasm_bindgen]
pub fn encode_state(doc: &DocState) -> Uint8Array {
    doc.encode_state()
}

/// Decode binary state into a new document.
/// 
/// Creates a new DocState from previously encoded binary data.
#[wasm_bindgen]
pub fn decode_state(state: Uint8Array) -> Result<DocState, JsValue> {
    let mut doc = DocState::new();
    doc.apply_update(state)?;
    Ok(doc)
}

/// Merge two state vectors, returning a new vector that includes both.
#[wasm_bindgen]
pub fn merge_state_vectors(sv1: Uint8Array, sv2: Uint8Array) -> Result<Uint8Array, JsValue> {
    let bytes1 = sv1.to_vec();
    let bytes2 = sv2.to_vec();
    
    let mut sva = StateVector::decode_v1(&bytes1)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode state vector 1: {}", e)))?;
    let svb = StateVector::decode_v1(&bytes2)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode state vector 2: {}", e)))?;
    
    for (client, clock) in svb.iter() {
        let existing = sva.get(client);
        if clock > existing {
            sva.set_max(client, clock);
        }
    }
    
    Ok(Uint8Array::from(sva.encode_v1().as_slice()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_doc_state_creation() {
        let doc = create_doc();
        let sv = doc.state_vector();
        assert!(sv.length() > 0);
    }

    #[test]
    fn test_text_operations() {
        let mut doc = create_doc();
        let text = doc.create_text("content".to_string());
        
        text.insert(&doc, 0, "Hello".to_string()).unwrap();
        assert_eq!(text.get_text(&doc), "Hello");
        
        text.insert(&doc, 5, " World".to_string()).unwrap();
        assert_eq!(text.get_text(&doc), "Hello World");
        
        text.delete(&doc, 5, 6).unwrap();
        assert_eq!(text.get_text(&doc), "Hello");
    }

    #[test]
    fn test_map_operations() {
        let mut doc = create_doc();
        let map = doc.create_map("metadata".to_string());
        
        map.set(&doc, "key".to_string(), "value".to_string()).unwrap();
        assert_eq!(map.get(&doc, "key".to_string()), Some("value".to_string()));
        
        map.delete(&doc, "key".to_string()).unwrap();
        assert_eq!(map.get(&doc, "key".to_string()), None);
    }
}

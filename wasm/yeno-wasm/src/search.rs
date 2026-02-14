//! Full-Text Search Module
//!
//! Provides efficient text search with multiple matching strategies:
//! - Exact substring matching using Aho-Corasick algorithm
//! - Regex pattern matching
//! - Case-sensitive and case-insensitive options

use js_sys::Array;
use regex::RegexBuilder;
use wasm_bindgen::prelude::*;
use aho_corasick::AhoCorasick;

/// A single search match result
#[wasm_bindgen]
#[derive(Clone)]
pub struct SearchMatch {
    /// Start position of the match (byte offset)
    pub start: usize,
    /// End position of the match (exclusive)
    pub end: usize,
    /// The matched text
    pub text: String,
}

/// Container for all search results
#[wasm_bindgen]
pub struct SearchResult {
    /// Array of all matches
    pub matches: Array,
    /// Total number of matches found
    pub count: usize,
    /// Search pattern used
    pub pattern: String,
    /// Whether the search was case-sensitive
    pub case_sensitive: bool,
}

impl SearchResult {
    fn new(pattern: String, case_sensitive: bool) -> Self {
        Self {
            matches: Array::new(),
            count: 0,
            pattern,
            case_sensitive,
        }
    }

    fn add_match(&mut self, start: usize, end: usize, text: String) {
        let m = SearchMatch { start, end, text };
        self.matches.push(&JsValue::from(SearchMatch::to_js(&m)));
        self.count += 1;
    }
}

impl SearchMatch {
    fn to_js(&self) -> js_sys::Object {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"start".into(), &self.start.into()).unwrap();
        js_sys::Reflect::set(&obj, &"end".into(), &self.end.into()).unwrap();
        js_sys::Reflect::set(&obj, &"text".into(), &self.text.clone().into()).unwrap();
        obj
    }
}

/// Search for exact substring matches in text.
///
/// Uses Aho-Corasick algorithm for efficient multi-pattern matching.
/// For single patterns, this is still very fast O(n).
///
/// # Arguments
/// * `text` - Text to search in
/// * `pattern` - Substring pattern to find
/// * `case_sensitive` - Whether to match case exactly
///
/// # Returns
/// SearchResult with all matches and metadata
#[wasm_bindgen]
pub fn search(text: String, pattern: String, case_sensitive: bool) -> SearchResult {
    if pattern.is_empty() || text.is_empty() {
        return SearchResult::new(pattern, case_sensitive);
    }

    let mut result = SearchResult::new(pattern.clone(), case_sensitive);
    
    let search_text = if case_sensitive {
        text.clone()
    } else {
        text.to_lowercase()
    };
    
    let search_pattern = if case_sensitive {
        pattern.clone()
    } else {
        pattern.to_lowercase()
    };

    let ac = AhoCorasick::new([&search_pattern]).unwrap();
    
    for mat in ac.find_iter(&search_text) {
        let start = mat.start();
        let end = mat.end();
        let matched_text = text[start..end].to_string();
        result.add_match(start, end, matched_text);
    }

    result
}

/// Search using a regular expression pattern.
///
/// Supports standard regex syntax. Invalid patterns return an error.
///
/// # Arguments
/// * `text` - Text to search in
/// * `pattern` - Regex pattern to match
/// * `case_sensitive` - Whether to match case exactly
///
/// # Returns
/// SearchResult with all matches and metadata, or error string
#[wasm_bindgen]
pub fn search_regex(text: String, pattern: String, case_sensitive: bool) -> Result<SearchResult, JsValue> {
    if pattern.is_empty() || text.is_empty() {
        return Ok(SearchResult::new(pattern, case_sensitive));
    }

    let mut result = SearchResult::new(pattern.clone(), case_sensitive);
    
    let re = RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| JsValue::from_str(&format!("Invalid regex: {}", e)))?;

    for cap in re.find_iter(&text) {
        let start = cap.start();
        let end = cap.end();
        let matched_text = cap.as_str().to_string();
        result.add_match(start, end, matched_text);
    }

    Ok(result)
}

/// Search for multiple patterns at once.
///
/// Uses Aho-Corasick algorithm for efficient simultaneous pattern matching.
///
/// # Arguments
/// * `text` - Text to search in
/// * `patterns` - Array of patterns to search for
/// * `case_sensitive` - Whether to match case exactly
///
/// # Returns
/// Object mapping each pattern to its SearchResult
#[wasm_bindgen]
pub fn search_multi(text: String, patterns: Array, case_sensitive: bool) -> Result<js_sys::Object, JsValue> {
    let result = js_sys::Object::new();
    
    if text.is_empty() {
        return Ok(result);
    }

    let pattern_vec: Vec<String> = patterns
        .iter()
        .filter_map(|p| p.as_string())
        .filter(|p| !p.is_empty())
        .collect();

    if pattern_vec.is_empty() {
        return Ok(result);
    }

    let search_text = if case_sensitive {
        text.clone()
    } else {
        text.to_lowercase()
    };

    let search_patterns: Vec<String> = if case_sensitive {
        pattern_vec.clone()
    } else {
        pattern_vec.iter().map(|p| p.to_lowercase()).collect()
    };

    let ac = AhoCorasick::new(&search_patterns).unwrap();
    
    // Initialize result arrays for each pattern
    let mut pattern_results: std::collections::HashMap<String, Array> = 
        pattern_vec.iter().map(|p| (p.clone(), Array::new())).collect();

    for mat in ac.find_iter(&search_text) {
        let pattern_idx = mat.pattern().as_usize();
        let pattern = &pattern_vec[pattern_idx];
        let start = mat.start();
        let end = mat.end();
        let matched_text = text[start..end].to_string();
        
        let match_obj = js_sys::Object::new();
        js_sys::Reflect::set(&match_obj, &"start".into(), &start.into()).unwrap();
        js_sys::Reflect::set(&match_obj, &"end".into(), &end.into()).unwrap();
        js_sys::Reflect::set(&match_obj, &"text".into(), &matched_text.into()).unwrap();
        
        if let Some(arr) = pattern_results.get_mut(pattern) {
            arr.push(&match_obj);
        }
    }

    // Build final result object
    for (pattern, arr) in pattern_results {
        let info = js_sys::Object::new();
        js_sys::Reflect::set(&info, &"matches".into(), &arr.into()).unwrap();
        js_sys::Reflect::set(&info, &"count".into(), &arr.length().into()).unwrap();
        js_sys::Reflect::set(&result, &pattern.into(), &info.into()).unwrap();
    }

    Ok(result)
}

/// Check if a regex pattern is valid.
///
/// # Arguments
/// * `pattern` - Regex pattern to validate
///
/// # Returns
/// true if valid, false otherwise
#[wasm_bindgen]
pub fn is_valid_regex(pattern: String) -> bool {
    RegexBuilder::new(&pattern)
        .build()
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_basic() {
        let text = "Hello world, hello universe!".to_string();
        let result = search(text, "hello".to_string(), false);
        assert_eq!(result.count, 2);
    }

    #[test]
    fn test_search_case_sensitive() {
        let text = "Hello world, hello universe!".to_string();
        let result = search(text, "Hello".to_string(), true);
        assert_eq!(result.count, 1);
    }

    #[test]
    fn test_search_regex() {
        let text = "Hello 123 world 456".to_string();
        let result = search_regex(text, r"\d+".to_string(), true).unwrap();
        assert_eq!(result.count, 2);
    }

    #[test]
    fn test_search_empty_pattern() {
        let text = "Hello world".to_string();
        let result = search(text, "".to_string(), true);
        assert_eq!(result.count, 0);
    }

    #[test]
    fn test_is_valid_regex() {
        assert!(is_valid_regex(r"\d+".to_string()));
        assert!(!is_valid_regex(r"[unclosed".to_string()));
    }
}

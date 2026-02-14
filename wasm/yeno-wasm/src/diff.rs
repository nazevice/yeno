//! Diff Module using Patience Diff Algorithm
//!
//! Provides efficient text diffing for document versioning.
//! Uses the patience diff algorithm which produces human-readable diffs
//! by matching unique common sequences first.

use js_sys::Array;
use wasm_bindgen::prelude::*;
use similar::{ChangeTag, TextDiff};

/// A single diff operation
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DiffOp {
    /// Text was inserted
    Insert = 0,
    /// Text was deleted
    Delete = 1,
    /// Text is unchanged
    Equal = 2,
}

impl From<ChangeTag> for DiffOp {
    fn from(tag: ChangeTag) -> Self {
        match tag {
            ChangeTag::Insert => DiffOp::Insert,
            ChangeTag::Delete => DiffOp::Delete,
            ChangeTag::Equal => DiffOp::Equal,
        }
    }
}

/// A single change in the diff
#[wasm_bindgen]
pub struct DiffHunk {
    /// The operation type
    pub op: DiffOp,
    /// The text content
    pub text: String,
    /// Starting line number in original text (for context)
    pub old_start: usize,
    /// Number of lines in original text
    pub old_lines: usize,
    /// Starting line number in new text
    pub new_start: usize,
    /// Number of lines in new text
    pub new_lines: usize,
}

impl DiffHunk {
    fn to_js(&self) -> js_sys::Object {
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"op".into(), &(self.op as u8).into()).unwrap();
        js_sys::Reflect::set(&obj, &"text".into(), &self.text.clone().into()).unwrap();
        js_sys::Reflect::set(&obj, &"oldStart".into(), &self.old_start.into()).unwrap();
        js_sys::Reflect::set(&obj, &"oldLines".into(), &self.old_lines.into()).unwrap();
        js_sys::Reflect::set(&obj, &"newStart".into(), &self.new_start.into()).unwrap();
        js_sys::Reflect::set(&obj, &"newLines".into(), &self.new_lines.into()).unwrap();
        obj
    }
}

/// Result of a diff operation
#[wasm_bindgen]
pub struct DiffResult {
    /// Array of diff hunks
    pub hunks: Array,
    /// Total number of hunks
    pub count: usize,
    /// Number of insertions
    pub insertions: usize,
    /// Number of deletions
    pub deletions: usize,
    /// Number of unchanged lines
    pub unchanged: usize,
    /// Similarity ratio (0.0 to 1.0)
    pub similarity: f64,
}

impl DiffResult {
    fn new() -> Self {
        Self {
            hunks: Array::new(),
            count: 0,
            insertions: 0,
            deletions: 0,
            unchanged: 0,
            similarity: 1.0,
        }
    }

    fn add_hunk(&mut self, hunk: DiffHunk) {
        self.hunks.push(&hunk.to_js());
        self.count += 1;
        match hunk.op {
            DiffOp::Insert => self.insertions += 1,
            DiffOp::Delete => self.deletions += 1,
            DiffOp::Equal => self.unchanged += 1,
        }
    }

    fn calculate_similarity(&mut self) {
        let total = self.insertions + self.deletions + self.unchanged;
        if total > 0 {
            self.similarity = self.unchanged as f64 / total as f64;
        }
    }
}

/// Compute the diff between two texts.
///
/// Uses line-based diffing for better human readability.
///
/// # Arguments
/// * `old_text` - Original text
/// * `new_text` - Modified text
///
/// # Returns
/// DiffResult containing all changes and statistics
#[wasm_bindgen]
pub fn diff(old_text: String, new_text: String) -> DiffResult {
    let old_lines: Vec<&str> = old_text.lines().collect();
    let new_lines: Vec<&str> = new_text.lines().collect();
    
    let text_diff = TextDiff::from_lines(&old_text, &new_text);
    
    let mut result = DiffResult::new();
    let mut old_line = 0;
    let mut new_line = 0;
    
    for change in text_diff.iter_all_changes() {
        let op = DiffOp::from(change.tag());
        let text = change.value().to_string();
        let text_lines = text.lines().count().max(1);
        
        let hunk = DiffHunk {
            op,
            text,
            old_start: if op == DiffOp::Delete || op == DiffOp::Equal { old_line } else { 0 },
            old_lines: if op == DiffOp::Delete || op == DiffOp::Equal { text_lines } else { 0 },
            new_start: if op == DiffOp::Insert || op == DiffOp::Equal { new_line } else { 0 },
            new_lines: if op == DiffOp::Insert || op == DiffOp::Equal { text_lines } else { 0 },
        };
        
        match op {
            DiffOp::Delete => old_line += text_lines,
            DiffOp::Insert => new_line += text_lines,
            DiffOp::Equal => {
                old_line += text_lines;
                new_line += text_lines;
            }
        }
        
        result.add_hunk(hunk);
    }
    
    result.calculate_similarity();
    result
}

/// Compute a character-level diff for more granular changes.
///
/// Useful for inline diffs within lines.
///
/// # Arguments
/// * `old_text` - Original text
/// * `new_text` - Modified text
///
/// # Returns
/// DiffResult containing character-level changes
#[wasm_bindgen]
pub fn diff_chars(old_text: String, new_text: String) -> DiffResult {
    let text_diff = TextDiff::from_chars(&old_text, &new_text);
    
    let mut result = DiffResult::new();
    let mut current_text = String::new();
    let mut current_op: Option<DiffOp> = None;
    
    for change in text_diff.iter_all_changes() {
        let op = DiffOp::from(change.tag());
        
        if current_op.is_none() {
            current_op = Some(op);
        }
        
        if current_op == Some(op) {
            current_text.push_str(change.value());
        } else {
            if let Some(op) = current_op {
                let hunk = DiffHunk {
                    op,
                    text: current_text.clone(),
                    old_start: 0,
                    old_lines: 0,
                    new_start: 0,
                    new_lines: 0,
                };
                result.add_hunk(hunk);
            }
            current_op = Some(op);
            current_text = change.value().to_string();
        }
    }
    
    if !current_text.is_empty() {
        if let Some(op) = current_op {
            let hunk = DiffHunk {
                op,
                text: current_text,
                old_start: 0,
                old_lines: 0,
                new_start: 0,
                new_lines: 0,
            };
            result.add_hunk(hunk);
        }
    }
    
    result.calculate_similarity();
    result
}

/// Compute word-level diff.
///
/// Useful for prose documents where word boundaries matter.
///
/// # Arguments
/// * `old_text` - Original text
/// * `new_text` - Modified text
///
/// # Returns
/// DiffResult containing word-level changes
#[wasm_bindgen]
pub fn diff_words(old_text: String, new_text: String) -> DiffResult {
    let old_words: Vec<&str> = old_text.split_whitespace().collect();
    let new_words: Vec<&str> = new_text.split_whitespace().collect();
    
    // Join words with spaces for diffing
    let old_joined = old_words.join("\n");
    let new_joined = new_words.join("\n");
    
    let text_diff = TextDiff::from_lines(&old_joined, &new_joined);
    
    let mut result = DiffResult::new();
    
    for change in text_diff.iter_all_changes() {
        let op = DiffOp::from(change.tag());
        let text = change.value().trim().to_string();
        
        if text.is_empty() {
            continue;
        }
        
        let hunk = DiffHunk {
            op,
            text,
            old_start: 0,
            old_lines: 0,
            new_start: 0,
            new_lines: 0,
        };
        
        result.add_hunk(hunk);
    }
    
    result.calculate_similarity();
    result
}

/// Check if two texts are identical.
///
/// # Arguments
/// * `old_text` - Original text
/// * `new_text` - Modified text
///
/// # Returns
/// true if texts are identical, false otherwise
#[wasm_bindgen]
pub fn texts_equal(old_text: String, new_text: String) -> bool {
    old_text == new_text
}

/// Get a unified diff string.
///
/// Produces a standard unified diff format suitable for display or patch files.
///
/// # Arguments
/// * `old_text` - Original text
/// * `new_text` - Modified text
/// * `old_name` - Name for the original file
/// * `new_name` - Name for the modified file
/// * `context_lines` - Number of context lines around changes
///
/// # Returns
/// Unified diff string
#[wasm_bindgen]
pub fn unified_diff(
    old_text: String,
    new_text: String,
    old_name: String,
    new_name: String,
    context_lines: usize,
) -> String {
    let text_diff = TextDiff::from_lines(&old_text, &new_text);
    
    let mut output = String::new();
    output.push_str(&format!("--- {}\n", old_name));
    output.push_str(&format!("+++ {}\n", new_name));
    
    for hunk in text_diff.unified_diff().context_radius(context_lines).iter_hunks() {
        output.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            hunk.old_range().start + 1,
            hunk.old_range().len,
            hunk.new_range().start + 1,
            hunk.new_range().len
        ));
        
        for change in hunk.iter_changes() {
            let prefix = match change.tag() {
                ChangeTag::Delete => '-',
                ChangeTag::Insert => '+',
                ChangeTag::Equal => ' ',
            };
            output.push_str(&format!("{}{}", prefix, change.value()));
        }
    }
    
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_basic() {
        let old = "Hello\nWorld".to_string();
        let new = "Hello\nThere\nWorld".to_string();
        
        let result = diff(old, new);
        assert!(result.insertions > 0);
        assert!(result.similarity > 0.5);
    }

    #[test]
    fn test_diff_identical() {
        let text = "Hello\nWorld".to_string();
        let result = diff(text.clone(), text);
        
        assert_eq!(result.insertions, 0);
        assert_eq!(result.deletions, 0);
        assert_eq!(result.similarity, 1.0);
    }

    #[test]
    fn test_diff_chars() {
        let old = "Hello".to_string();
        let new = "Hallo".to_string();
        
        let result = diff_chars(old, new);
        assert!(result.count > 0);
    }

    #[test]
    fn test_texts_equal() {
        assert!(texts_equal("Hello".to_string(), "Hello".to_string()));
        assert!(!texts_equal("Hello".to_string(), "World".to_string()));
    }

    #[test]
    fn test_unified_diff() {
        let old = "line1\nline2\nline3".to_string();
        let new = "line1\nmodified\nline3".to_string();
        
        let result = unified_diff(old, new, "old.txt".to_string(), "new.txt".to_string(), 3);
        assert!(result.contains("--- old.txt"));
        assert!(result.contains("+++ new.txt"));
        assert!(result.contains("@@"));
    }
}

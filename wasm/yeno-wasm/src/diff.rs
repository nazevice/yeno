//! Diff Module using Patience Diff Algorithm
//!
//! Provides efficient text diffing for document versioning.
//! Uses the patience diff algorithm which produces human-readable diffs
//! by matching unique common sequences first.

use js_sys::Array;
use serde::Serialize;
use serde_wasm_bindgen::to_value;
use similar::{ChangeTag, TextDiff};
use wasm_bindgen::prelude::*;

/// Diff line kind for structured version diff (matches Tauri VersionDiff)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

/// Single line in a diff hunk (matches Tauri DiffLine)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionDiffLine {
    kind: DiffLineKind,
    content: String,
    old_line: Option<usize>,
    new_line: Option<usize>,
}

/// Single hunk in a diff (matches Tauri DiffHunk for versioning)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionDiffHunk {
    header: String,
    old_start: usize,
    old_lines: usize,
    new_start: usize,
    new_lines: usize,
    lines: Vec<VersionDiffLine>,
}

/// Structured diff result (matches Tauri VersionDiff)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionDiffResult {
    from_version_id: String,
    to_version_id: String,
    additions: usize,
    deletions: usize,
    unchanged: usize,
    similarity: f64,
    unified_diff: String,
    hunks: Vec<VersionDiffHunk>,
}

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
#[wasm_bindgen(getter_with_clone)]
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
#[wasm_bindgen(getter_with_clone)]
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
        let header_str = hunk.header().to_string();
        output.push_str(&format!("{}\n", header_str.trim()));
        
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

fn split_change_into_lines(value: &str) -> Vec<String> {
    let lines: Vec<&str> = value.lines().collect();
    if lines.is_empty() && !value.is_empty() {
        vec![value.to_string()]
    } else {
        lines.iter().map(|s| (*s).to_string()).collect()
    }
}

/// Parse a hunk header like "@@ -1,5 +1,6 @@" into (old_start, old_lines, new_start, new_lines).
fn parse_hunk_header(header: &str) -> (usize, usize, usize, usize) {
    let trim = header.trim().trim_start_matches("@@").trim_end_matches("@@").trim();
    let parts: Vec<&str> = trim.split_whitespace().collect();
    if parts.len() >= 2 {
        let parse_range = |s: &str| -> (usize, usize) {
            let s = s.trim_start_matches('-').trim_start_matches('+');
            let nums: Vec<usize> = s.split(',').filter_map(|x| x.parse().ok()).collect();
            if nums.len() >= 2 {
                (nums[0], nums[1])
            } else if nums.len() == 1 {
                (nums[0], 1)
            } else {
                (1, 0)
            }
        };
        let (old_start, old_lines) = parse_range(parts[0]);
        let (new_start, new_lines) = parse_range(parts[1]);
        (old_start, old_lines, new_start, new_lines)
    } else {
        (1, 0, 1, 0)
    }
}

/// Compute structured diff for version comparison.
/// Returns VersionDiff-compatible output for the DiffViewer UI.
#[wasm_bindgen]
pub fn diff_versions_structured(
    old_text: String,
    new_text: String,
    from_version_id: String,
    to_version_id: String,
) -> JsValue {
    let text_diff = TextDiff::from_lines(&old_text, &new_text);

    let mut additions = 0;
    let mut deletions = 0;
    let mut unchanged = 0;
    let mut hunks: Vec<VersionDiffHunk> = Vec::new();

    let mut unified_diff = String::new();
    unified_diff.push_str("--- Version (old)\n");
    unified_diff.push_str("+++ Version (new)\n");

    for hunk in text_diff.unified_diff().context_radius(3).iter_hunks() {
        let header_str = hunk.header().to_string();
        let (old_start, old_lines, new_start, new_lines) = parse_hunk_header(&header_str);

        let mut diff_lines: Vec<VersionDiffLine> = Vec::new();
        let mut old_line = old_start;
        let mut new_line = new_start;
        let header = format!("@@ -{},{} +{},{} @@", old_start, old_lines, new_start, new_lines);
        unified_diff.push_str(&header);
        unified_diff.push('\n');

        for change in hunk.iter_changes() {
            let value = change.value();
            let lines = split_change_into_lines(value);
            let line_count = lines.len().max(1);

            for (i, line_content) in lines.iter().enumerate() {
                let (kind, prefix, old_line_num, new_line_num) = match change.tag() {
                    ChangeTag::Delete => {
                        deletions += 1;
                        (DiffLineKind::Deletion, '-', Some(old_line + i), None)
                    }
                    ChangeTag::Insert => {
                        additions += 1;
                        (DiffLineKind::Addition, '+', None, Some(new_line + i))
                    }
                    ChangeTag::Equal => {
                        unchanged += 1;
                        (
                            DiffLineKind::Context,
                            ' ',
                            Some(old_line + i),
                            Some(new_line + i),
                        )
                    }
                };

                unified_diff.push(prefix);
                unified_diff.push_str(line_content);
                unified_diff.push('\n');

                diff_lines.push(VersionDiffLine {
                    kind,
                    content: line_content.clone(),
                    old_line: old_line_num,
                    new_line: new_line_num,
                });
            }

            match change.tag() {
                ChangeTag::Delete => old_line += line_count,
                ChangeTag::Insert => new_line += line_count,
                ChangeTag::Equal => {
                    old_line += line_count;
                    new_line += line_count;
                }
            }
        }

        hunks.push(VersionDiffHunk {
            header,
            old_start,
            old_lines,
            new_start,
            new_lines,
            lines: diff_lines,
        });
    }

    let total = additions + deletions + unchanged;
    let similarity = if total > 0 {
        unchanged as f64 / total as f64
    } else {
        1.0
    };

    let result = VersionDiffResult {
        from_version_id: from_version_id.clone(),
        to_version_id: to_version_id.clone(),
        additions,
        deletions,
        unchanged,
        similarity,
        unified_diff,
        hunks,
    };

    to_value(&result).unwrap_or(JsValue::NULL)
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

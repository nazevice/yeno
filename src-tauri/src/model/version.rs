use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A snapshot of a document at a specific point in time.
/// Versions are immutable once created.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersion {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Version number (sequential, 1-indexed)
    pub version_number: u32,
    /// ISO 8601 timestamp when version was created
    pub created_at: DateTime<Utc>,
    /// User-provided label for this version (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// SHA-256 hash of the content for integrity verification
    pub content_hash: String,
    /// The text content at this version
    pub content: String,
    /// Formatting metadata at this version
    #[serde(default)]
    pub metadata: super::piece_table::PieceTableContent,
}

/// Summary of a version for list display (without full content).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub version_number: u32,
    pub created_at: DateTime<Utc>,
    pub label: Option<String>,
    pub content_hash: String,
    /// Character count at this version
    pub char_count: usize,
    /// Line count at this version
    pub line_count: usize,
}

/// Result of comparing two versions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDiff {
    /// Source version ID
    pub from_version_id: String,
    /// Target version ID
    pub to_version_id: String,
    /// Number of lines added
    pub additions: usize,
    /// Number of lines removed
    pub deletions: usize,
    /// Number of unchanged lines
    pub unchanged: usize,
    /// Similarity ratio (0.0 to 1.0)
    pub similarity: f64,
    /// Unified diff output
    pub unified_diff: String,
    /// Structured hunks for UI rendering
    pub hunks: Vec<DiffHunk>,
}

/// A single hunk in the diff.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    /// Header line (e.g., "@@ -1,5 +1,6 @@")
    pub header: String,
    /// Old file start line
    pub old_start: usize,
    /// Old file line count
    pub old_lines: usize,
    /// New file start line
    pub new_start: usize,
    /// New file line count
    pub new_lines: usize,
    /// Lines in this hunk with change type
    pub lines: Vec<DiffLine>,
}

/// A single line in a diff hunk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// Type of change
    pub kind: DiffLineKind,
    /// The line content (without prefix character)
    pub content: String,
    /// Line number in old file (None for additions)
    pub old_line: Option<usize>,
    /// Line number in new file (None for deletions)
    pub new_line: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

impl DocumentVersion {
    /// Create a new version from content.
    pub fn new(version_number: u32, content: String, label: Option<String>) -> Self {
        use sha2::{Digest, Sha256};
        
        let content_hash = {
            let mut hasher = Sha256::new();
            hasher.update(content.as_bytes());
            format!("{:x}", hasher.finalize())
        };

        let metadata = super::piece_table::PieceTableContent {
            base_text: content.clone(),
            chunks: vec![super::piece_table::PieceChunk {
                kind: super::piece_table::ChunkType::Original,
                offset: Some(0),
                len: Some(content.len()),
                source: Some("baseText".to_string()),
                pos: None,
                data: None,
            }],
        };

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            version_number,
            created_at: Utc::now(),
            label,
            content_hash,
            content,
            metadata,
        }
    }

    /// Convert to a summary for list display.
    pub fn to_summary(&self) -> VersionSummary {
        VersionSummary {
            id: self.id.clone(),
            version_number: self.version_number,
            created_at: self.created_at,
            label: self.label.clone(),
            content_hash: self.content_hash.clone(),
            char_count: self.content.len(),
            line_count: self.content.lines().count(),
        }
    }
}

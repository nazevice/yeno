use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};
use thiserror::Error;

use crate::model::piece_table::{ChunkType, PieceChunk};
use crate::model::version::{DiffHunk, DiffLine, DiffLineKind, DocumentVersion, VersionDiff, VersionSummary};
use crate::storage::zip_container::{load_document, save_document, DocumentPayload, StorageError};

#[derive(Debug, Error)]
pub enum VersionError {
    #[error("storage error: {0}")]
    Storage(#[from] StorageError),
    #[error("version not found: {0}")]
    NotFound(String),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVersionRequest {
    pub path: String,
    pub content: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVersionResponse {
    pub version: DocumentVersion,
    pub all_versions: Vec<VersionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListVersionsResponse {
    pub versions: Vec<VersionSummary>,
    pub current_version_number: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetVersionResponse {
    pub version: DocumentVersion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffVersionsRequest {
    pub path: String,
    pub from_version_id: String,
    pub to_version_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreVersionRequest {
    pub path: String,
    pub version_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteVersionRequest {
    pub path: String,
    pub version_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteVersionResponse {
    pub versions: Vec<VersionSummary>,
}

fn load_or_create_payload(path: impl AsRef<Path>) -> Result<DocumentPayload, VersionError> {
    match load_document(path.as_ref()) {
        Ok(p) => Ok(p),
        Err(StorageError::Io(e)) if e.kind() == ErrorKind::NotFound => Ok(DocumentPayload {
            base_text: String::new(),
            chunks: vec![PieceChunk {
                kind: ChunkType::Original,
                offset: Some(0),
                len: Some(0),
                source: Some("baseText".to_string()),
                pos: None,
                data: None,
            }],
            metadata: Default::default(),
            versions: vec![],
            assets: vec![],
        }),
        Err(e) => Err(e.into()),
    }
}

/// Create a new version of the document.
/// This captures the current state without modifying the working content.
/// If the document file does not exist, creates it with the version as the first version.
#[tauri::command]
pub fn create_version(request: CreateVersionRequest) -> Result<CreateVersionResponse, VersionError> {
    let path = PathBuf::from(&request.path);
    let mut payload = load_or_create_payload(&path)?;

    let next_version_number = next_version_number(&payload.versions);
    let version = DocumentVersion::new(next_version_number, request.content, request.label);

    let version_json = serde_json::to_value(&version)?;
    payload.versions.push(version_json);

    save_document(&path, &payload)?;

    let all_versions = build_version_summaries(&payload.versions);

    Ok(CreateVersionResponse {
        version,
        all_versions,
    })
}

/// List all versions of a document.
#[tauri::command]
pub fn list_versions(path: String) -> Result<ListVersionsResponse, VersionError> {
    let path = PathBuf::from(path);
    let payload = load_document(&path)?;

    let versions = build_version_summaries(&payload.versions);
    let current_version_number = versions
        .iter()
        .map(|v| v.version_number)
        .max()
        .unwrap_or(0);

    Ok(ListVersionsResponse {
        versions,
        current_version_number,
    })
}

/// Get a specific version by ID.
#[tauri::command]
pub fn get_version(path: String, version_id: String) -> Result<GetVersionResponse, VersionError> {
    let path = PathBuf::from(path);
    let payload = load_document(&path)?;

    let version = find_version(&payload.versions, &version_id)?;
    Ok(GetVersionResponse { version })
}

/// Compare two versions and return the diff.
#[tauri::command]
pub fn diff_versions(request: DiffVersionsRequest) -> Result<VersionDiff, VersionError> {
    let path = PathBuf::from(&request.path);
    let payload = load_document(&path)?;

    let from_version = find_version(&payload.versions, &request.from_version_id)?;
    let to_version = find_version(&payload.versions, &request.to_version_id)?;

    compute_diff(from_version, to_version)
}

/// Restore the document to a previous version.
/// Creates a new version with the restored content.
#[tauri::command]
pub fn restore_version(request: RestoreVersionRequest) -> Result<CreateVersionResponse, VersionError> {
    let path = PathBuf::from(&request.path);
    let mut payload = load_document(&path)?;

    let target_version = find_version(&payload.versions, &request.version_id)?;
    let next_version_number = next_version_number(&payload.versions);

    let label = Some(format!("Restored from version {}", target_version.version_number));
    let restored =
        DocumentVersion::new(next_version_number, target_version.content.clone(), label);

    payload.base_text = target_version.content.clone();
    payload.chunks = vec![PieceChunk {
        kind: ChunkType::Original,
        offset: Some(0),
        len: Some(target_version.content.len()),
        source: Some("baseText".to_string()),
        pos: None,
        data: None,
    }];

    let version_json = serde_json::to_value(&restored)?;
    payload.versions.push(version_json);

    save_document(&path, &payload)?;

    let all_versions = build_version_summaries(&payload.versions);

    Ok(CreateVersionResponse {
        version: restored,
        all_versions,
    })
}

/// Delete a specific version.
#[tauri::command]
pub fn delete_version(request: DeleteVersionRequest) -> Result<DeleteVersionResponse, VersionError> {
    let path = PathBuf::from(&request.path);
    let mut payload = load_document(&path)?;

    let initial_len = payload.versions.len();
    payload.versions.retain(|v| {
        v.get("id")
            .and_then(|id| id.as_str())
            .map(|id| id != request.version_id)
            .unwrap_or(true)
    });

    if payload.versions.len() == initial_len {
        return Err(VersionError::NotFound(request.version_id));
    }

    save_document(&path, &payload)?;
    let versions = build_version_summaries(&payload.versions);

    Ok(DeleteVersionResponse { versions })
}

// ============================================================================
// Helper Functions
// ============================================================================

fn next_version_number(versions: &[serde_json::Value]) -> u32 {
    versions
        .iter()
        .filter_map(|v| v.get("versionNumber").and_then(|n| n.as_u64()))
        .max()
        .unwrap_or(0) as u32
        + 1
}

fn build_version_summaries(versions: &[serde_json::Value]) -> Vec<VersionSummary> {
    versions
        .iter()
        .filter_map(|v| {
            serde_json::from_value::<DocumentVersion>(v.clone())
                .ok()
                .map(|ver| ver.to_summary())
        })
        .collect()
}

fn find_version(
    versions: &[serde_json::Value],
    version_id: &str,
) -> Result<DocumentVersion, VersionError> {
    for version_value in versions {
        if let Some(id) = version_value.get("id").and_then(|i| i.as_str()) {
            if id == version_id {
                return serde_json::from_value(version_value.clone())
                    .map_err(VersionError::from);
            }
        }
    }
    Err(VersionError::NotFound(version_id.to_string()))
}

fn split_change_into_lines(value: &str) -> Vec<String> {
    let lines: Vec<&str> = value.lines().collect();
    if lines.is_empty() && !value.is_empty() {
        vec![value.to_string()]
    } else {
        lines.iter().map(|s| (*s).to_string()).collect()
    }
}

fn compute_diff(from: DocumentVersion, to: DocumentVersion) -> Result<VersionDiff, VersionError> {
    let old_text = &from.content;
    let new_text = &to.content;

    let text_diff = TextDiff::from_lines(old_text, new_text);

    let mut additions = 0;
    let mut deletions = 0;
    let mut unchanged = 0;
    let mut hunks: Vec<DiffHunk> = Vec::new();

    let mut unified_diff = String::new();
    unified_diff.push_str(&format!("--- Version {}\n", from.version_number));
    unified_diff.push_str(&format!("+++ Version {}\n", to.version_number));

    for hunk in text_diff.unified_diff().context_radius(3).iter_hunks() {
        let header = format!(
            "@@ -{},{} +{},{} @@",
            hunk.old_range().start + 1,
            hunk.old_range().len,
            hunk.new_range().start + 1,
            hunk.new_range().len
        );
        unified_diff.push_str(&header);
        unified_diff.push('\n');

        let mut diff_lines: Vec<DiffLine> = Vec::new();
        let mut old_line = hunk.old_range().start + 1;
        let mut new_line = hunk.new_range().start + 1;

        for change in hunk.iter_changes() {
            let value = change.value();
            let lines = split_change_into_lines(value);
            let line_count = lines.len().max(1);

            for (i, line_content) in lines.iter().enumerate() {
                let (kind, prefix, old_line_num, new_line_num) = match change.tag() {
                    ChangeTag::Delete => {
                        deletions += 1;
                        let l = Some(old_line + i);
                        (
                            DiffLineKind::Deletion,
                            '-',
                            l,
                            None,
                        )
                    }
                    ChangeTag::Insert => {
                        additions += 1;
                        let l = Some(new_line + i);
                        (
                            DiffLineKind::Addition,
                            '+',
                            None,
                            l,
                        )
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

                diff_lines.push(DiffLine {
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

        hunks.push(DiffHunk {
            header,
            old_start: hunk.old_range().start + 1,
            old_lines: hunk.old_range().len,
            new_start: hunk.new_range().start + 1,
            new_lines: hunk.new_range().len,
            lines: diff_lines,
        });
    }

    let total = additions + deletions + unchanged;
    let similarity = if total > 0 {
        unchanged as f64 / total as f64
    } else {
        1.0
    };

    Ok(VersionDiff {
        from_version_id: from.id,
        to_version_id: to.id,
        additions,
        deletions,
        unchanged,
        similarity,
        unified_diff,
        hunks,
    })
}

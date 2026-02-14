use std::path::PathBuf;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::model::piece_table::PieceTableContent;
use crate::storage::zip_container::{export_markdown, load_document, save_document, DocumentPayload};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub path: String,
    pub payload: DocumentPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub path: String,
    pub base_text: String,
    pub chunks: Vec<crate::model::piece_table::PieceChunk>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfSnapshot {
    pub operation: String,
    pub elapsed_ms: u128,
    pub payload_bytes: usize,
}

#[tauri::command]
pub fn save_grokedoc(request: SaveRequest) -> Result<PerfSnapshot, String> {
    let start = Instant::now();
    let path = PathBuf::from(request.path);
    let payload_size = serde_json::to_vec(&request.payload)
        .map_err(|err| err.to_string())?
        .len();
    save_document(&path, &request.payload).map_err(|err| err.to_string())?;
    Ok(PerfSnapshot {
        operation: "save_grokedoc".to_string(),
        elapsed_ms: start.elapsed().as_millis(),
        payload_bytes: payload_size,
    })
}

#[tauri::command]
pub fn load_grokedoc(path: String) -> Result<(DocumentPayload, PerfSnapshot), String> {
    let start = Instant::now();
    let parsed = load_document(PathBuf::from(path).as_path()).map_err(|err| err.to_string())?;
    let payload_size = serde_json::to_vec(&parsed).map_err(|err| err.to_string())?.len();
    Ok((
        parsed,
        PerfSnapshot {
            operation: "load_grokedoc".to_string(),
            elapsed_ms: start.elapsed().as_millis(),
            payload_bytes: payload_size,
        },
    ))
}

#[tauri::command]
pub fn export_document_markdown(request: ExportRequest) -> Result<PerfSnapshot, String> {
    let start = Instant::now();
    let content = PieceTableContent {
        base_text: request.base_text,
        chunks: request.chunks,
    };
    export_markdown(PathBuf::from(request.path).as_path(), &content).map_err(|err| err.to_string())?;
    let payload_size = content.to_text().len();
    Ok(PerfSnapshot {
        operation: "export_document_markdown".to_string(),
        elapsed_ms: start.elapsed().as_millis(),
        payload_bytes: payload_size,
    })
}

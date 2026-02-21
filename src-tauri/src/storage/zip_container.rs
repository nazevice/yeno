use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::Path;

use brotli::{CompressorReader, Decompressor};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use zip::read::ZipArchive;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::model::piece_table::PieceTableContent;
use crate::storage::checksum::sha256_hex;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("cbor error: {0}")]
    Cbor(#[from] serde_cbor::Error),
    #[error("integrity check failed: {0}")]
    Integrity(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataRange {
    pub start: usize,
    pub end: usize,
    #[serde(default)]
    pub attrs: BTreeMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPayload {
    #[serde(default)]
    pub ranges: Vec<MetadataRange>,
    #[serde(default)]
    pub embeddings: BTreeMap<String, Value>,
    #[serde(default)]
    pub custom: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub name: String,
    pub target_pos: usize,
    pub alt: String,
    pub size: (u32, u32),
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub base_text: String,
    pub chunks: Vec<crate::model::piece_table::PieceChunk>,
    #[serde(default)]
    pub metadata: MetadataPayload,
    #[serde(default)]
    pub versions: Vec<Value>,
    #[serde(default)]
    pub assets: Vec<AssetRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document_tree: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFiles {
    pub content: String,
    pub metadata: String,
    #[serde(default)]
    pub document_tree: Option<String>,
    #[serde(default)]
    pub versions: Vec<String>,
    pub assets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: String,
    pub content_type: String,
    pub last_modified: String,
    pub checksum: String,
    pub files: ManifestFiles,
    pub file_checksums: BTreeMap<String, String>,
}

fn maybe_compress_metadata(bytes: &[u8]) -> (String, Vec<u8>) {
    if bytes.len() <= 1024 {
        return ("metadata.json".to_string(), bytes.to_vec());
    }
    let mut compressed = Vec::new();
    let mut reader = CompressorReader::new(Cursor::new(bytes), 4096, 5, 22);
    if reader.read_to_end(&mut compressed).is_ok() {
        return ("metadata.json.br".to_string(), compressed);
    }
    ("metadata.json".to_string(), bytes.to_vec())
}

fn maybe_decompress_metadata(path: &str, bytes: &[u8]) -> Result<Vec<u8>, StorageError> {
    if !path.ends_with(".br") {
        return Ok(bytes.to_vec());
    }
    let mut out = Vec::new();
    let mut decompressor = Decompressor::new(Cursor::new(bytes), 4096);
    decompressor.read_to_end(&mut out)?;
    Ok(out)
}

fn crc_hex(crc: u32) -> String {
    format!("{crc:08x}")
}

pub fn save_document(path: &Path, payload: &DocumentPayload) -> Result<(), StorageError> {
    let file = File::create(path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let content = PieceTableContent {
        base_text: payload.base_text.clone(),
        chunks: payload.chunks.clone(),
    };
    let content_bytes = serde_cbor::to_vec(&content)?;

    let metadata_json = serde_json::to_vec(&payload.metadata)?;
    let (metadata_path, metadata_bytes) = maybe_compress_metadata(&metadata_json);

    let document_tree_bytes: Option<Vec<u8>> = payload
        .document_tree
        .as_ref()
        .map(serde_json::to_vec)
        .transpose()?;

    let version_paths: Vec<String> = payload
        .versions
        .iter()
        .enumerate()
        .map(|(idx, _)| format!("versions/delta-{}.jsonpatch", idx + 1))
        .collect();

    let mut asset_paths = Vec::with_capacity(payload.assets.len());
    for asset in &payload.assets {
        asset_paths.push(format!("assets/{}", asset.name));
    }

    // Build all bytes first to compute a deterministic payload hash.
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(&content_bytes);
    hash_input.extend_from_slice(&metadata_bytes);
    if let Some(ref dt) = document_tree_bytes {
        hash_input.extend_from_slice(dt);
    }
    for version in &payload.versions {
        hash_input.extend_from_slice(serde_json::to_string(version)?.as_bytes());
    }
    for asset in &payload.assets {
        hash_input.extend_from_slice(&asset.bytes);
    }
    let checksum = sha256_hex(&hash_input);

    let schema_version = if payload.document_tree.is_some() {
        "2.0"
    } else {
        "1.0"
    };

    zip.start_file("content.cbor", options)?;
    zip.write_all(&content_bytes)?;

    zip.start_file(&metadata_path, options)?;
    zip.write_all(&metadata_bytes)?;

    if let Some(ref dt) = document_tree_bytes {
        zip.start_file("documentTree.json", options)?;
        zip.write_all(dt)?;
    }

    for (idx, version) in payload.versions.iter().enumerate() {
        zip.start_file(&version_paths[idx], options)?;
        zip.write_all(serde_json::to_string_pretty(version)?.as_bytes())?;
    }

    let mut rels = BTreeMap::<String, Value>::new();
    for asset in &payload.assets {
        let asset_path = format!("assets/{}", asset.name);
        zip.start_file(&asset_path, options)?;
        zip.write_all(&asset.bytes)?;
        rels.insert(
            asset.name.clone(),
            serde_json::json!({
                "targetPos": asset.target_pos,
                "alt": asset.alt,
                "size": [asset.size.0, asset.size.1],
            }),
        );
    }

    zip.start_file("assets/rels.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&rels)?.as_bytes())?;

    // Finalize to get CRC values from a read pass.
    zip.finish()?;

    let mut archive = ZipArchive::new(File::open(path)?)?;
    let mut file_checksums = BTreeMap::new();
    for idx in 0..archive.len() {
        let entry = archive.by_index(idx)?;
        file_checksums.insert(entry.name().to_string(), crc_hex(entry.crc32()));
    }

    let manifest = Manifest {
        schema_version: schema_version.to_string(),
        content_type: "text/grokedoc".to_string(),
        last_modified: Utc::now().to_rfc3339(),
        checksum: checksum.clone(),
        files: ManifestFiles {
            content: "content.cbor".to_string(),
            metadata: metadata_path.clone(),
            document_tree: document_tree_bytes.map(|_| "documentTree.json".to_string()),
            versions: version_paths.clone(),
            assets: asset_paths.clone(),
        },
        file_checksums,
    };

    // Rewrite ZIP with manifest first for fast validation.
    let mut buffer = Vec::new();
    {
        let mut final_zip = ZipWriter::new(Cursor::new(&mut buffer));
        final_zip.start_file("manifest.json", options)?;
        final_zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;

        final_zip.start_file("content.cbor", options)?;
        final_zip.write_all(&content_bytes)?;

        final_zip.start_file(&metadata_path, options)?;
        final_zip.write_all(&metadata_bytes)?;

        if let Some(ref dt) = document_tree_bytes {
            final_zip.start_file("documentTree.json", options)?;
            final_zip.write_all(dt)?;
        }

        for (idx, version) in payload.versions.iter().enumerate() {
            final_zip.start_file(&version_paths[idx], options)?;
            final_zip.write_all(serde_json::to_string_pretty(version)?.as_bytes())?;
        }

        for asset in &payload.assets {
            let asset_path = format!("assets/{}", asset.name);
            final_zip.start_file(&asset_path, options)?;
            final_zip.write_all(&asset.bytes)?;
        }

        final_zip.start_file("assets/rels.json", options)?;
        final_zip.write_all(serde_json::to_string_pretty(&rels)?.as_bytes())?;
        final_zip.finish()?;
    }

    fs::write(path, buffer)?;
    Ok(())
}

pub fn load_document(path: &Path) -> Result<DocumentPayload, StorageError> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;

    let manifest: Manifest = {
        let mut manifest_file = archive.by_name("manifest.json")?;
        let mut manifest_bytes = Vec::new();
        manifest_file.read_to_end(&mut manifest_bytes)?;
        serde_json::from_slice(&manifest_bytes)?
    };

    // Validate CRC checksums where available.
    for idx in 0..archive.len() {
        let entry = archive.by_index(idx)?;
        if let Some(expected) = manifest.file_checksums.get(entry.name()) {
            let actual = crc_hex(entry.crc32());
            if &actual != expected {
                return Err(StorageError::Integrity(format!(
                    "crc mismatch for {}: expected {}, got {}",
                    entry.name(),
                    expected,
                    actual
                )));
            }
        }
    }

    let content: PieceTableContent = {
        let mut content_file = archive.by_name(&manifest.files.content)?;
        let mut content_bytes = Vec::new();
        content_file.read_to_end(&mut content_bytes)?;
        serde_cbor::from_slice(&content_bytes)?
    };

    let metadata: MetadataPayload = {
        let mut metadata_file = archive.by_name(&manifest.files.metadata)?;
        let mut metadata_bytes = Vec::new();
        metadata_file.read_to_end(&mut metadata_bytes)?;
        let metadata_json_bytes = maybe_decompress_metadata(&manifest.files.metadata, &metadata_bytes)?;
        serde_json::from_slice(&metadata_json_bytes)?
    };

    let document_tree = manifest
        .files
        .document_tree
        .as_ref()
        .and_then(|path| {
            let mut file = archive.by_name(path).ok()?;
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).ok()?;
            serde_json::from_slice::<Value>(&bytes).ok()
        });

    let mut versions = Vec::new();
    for version_path in &manifest.files.versions {
        if let Ok(mut version_file) = archive.by_name(version_path) {
            let mut bytes = Vec::new();
            version_file.read_to_end(&mut bytes)?;
            versions.push(serde_json::from_slice::<Value>(&bytes)?);
        }
    }

    let rels: BTreeMap<String, Value> = if let Ok(mut rels_file) = archive.by_name("assets/rels.json") {
        let mut rels_bytes = Vec::new();
        rels_file.read_to_end(&mut rels_bytes)?;
        serde_json::from_slice(&rels_bytes)?
    } else {
        BTreeMap::new()
    };

    let mut assets = Vec::new();
    for asset_path in &manifest.files.assets {
        if let Ok(mut file) = archive.by_name(asset_path) {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)?;
            let name = asset_path.trim_start_matches("assets/").to_string();
            let rel = rels.get(&name).cloned().unwrap_or_else(|| serde_json::json!({}));
            let target_pos = rel.get("targetPos").and_then(Value::as_u64).unwrap_or(0) as usize;
            let alt = rel
                .get("alt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let size = rel
                .get("size")
                .and_then(Value::as_array)
                .map(|arr| {
                    let w = arr.first().and_then(Value::as_u64).unwrap_or(0) as u32;
                    let h = arr.get(1).and_then(Value::as_u64).unwrap_or(0) as u32;
                    (w, h)
                })
                .unwrap_or((0, 0));

            assets.push(AssetRef {
                name,
                target_pos,
                alt,
                size,
                bytes,
            });
        }
    }

    // Validate payload checksum.
    let mut hash_input = Vec::new();
    hash_input.extend_from_slice(content.base_text.as_bytes());
    for chunk in &content.chunks {
        hash_input.extend_from_slice(serde_json::to_string(chunk)?.as_bytes());
    }
    hash_input.extend_from_slice(serde_json::to_string(&metadata)?.as_bytes());
    if let Some(ref dt) = document_tree {
        hash_input.extend_from_slice(serde_json::to_string(dt)?.as_bytes());
    }
    for version in &versions {
        hash_input.extend_from_slice(serde_json::to_string(version)?.as_bytes());
    }
    for asset in &assets {
        hash_input.extend_from_slice(&asset.bytes);
    }
    let checksum = sha256_hex(&hash_input);
    if checksum != manifest.checksum {
        return Err(StorageError::Integrity(format!(
            "payload checksum mismatch: expected {}, got {}",
            manifest.checksum, checksum
        )));
    }

    Ok(DocumentPayload {
        base_text: content.base_text,
        chunks: content.chunks,
        metadata,
        versions,
        assets,
        document_tree,
    })
}

pub fn export_markdown(path: &Path, content: &PieceTableContent) -> Result<(), StorageError> {
    fs::write(path, content.to_text())?;
    Ok(())
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieceChunk {
    #[serde(rename = "type")]
    pub kind: ChunkType,
    pub offset: Option<usize>,
    pub len: Option<usize>,
    pub source: Option<String>,
    pub pos: Option<usize>,
    pub data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChunkType {
    Original,
    Insert,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PieceTableContent {
    pub base_text: String,
    pub chunks: Vec<PieceChunk>,
}

impl PieceTableContent {
    pub fn to_text(&self) -> String {
        let mut text = self.base_text.clone();
        for chunk in &self.chunks {
            match chunk.kind {
                ChunkType::Insert => {
                    if let (Some(pos), Some(data)) = (chunk.pos, chunk.data.as_ref()) {
                        if pos <= text.len() {
                            text.insert_str(pos, data);
                        }
                    }
                }
                ChunkType::Delete => {
                    if let (Some(pos), Some(len)) = (chunk.pos, chunk.len) {
                        let end = (pos + len).min(text.len());
                        if pos < end {
                            text.replace_range(pos..end, "");
                        }
                    }
                }
                ChunkType::Original => {}
            }
        }
        text
    }
}

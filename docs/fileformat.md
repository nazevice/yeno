# Document Architecture & File Format Specification

## Status
**Accepted**

## Context
We are building a high-performance document editor. The system requires a robust architecture that supports rich semantics (paragraphs, headings, lists, tables, images, blockquotes), inline formatting, and efficient real-time editing. The architecture defines how data is stored, modeled in memory, and rendered to the screen.

## Decision

We adopt a **Tree-over-Buffer** architecture. This separates the *Physical Storage* (raw text in a piece table) from the *Logical Structure* (document tree with blocks).

---

## 1. File Format (Storage)

Documents are stored as **ZIP archives** with the `.grokedoc` extension. This allows granular access to resources and integrity verification via checksums.

### ZIP Contents

| File | Description |
|------|-------------|
| `manifest.json` | Schema version (`1.0` or `2.0`), content type (`text/grokedoc`), last modified, SHA-256 payload checksum, file list, and CRC32 checksums per entry |
| `content.cbor` | **Physical Layer**. Piece table content (base text + insert/delete chunks), **CBOR encoded** |
| `metadata.json` or `metadata.json.br` | Ranges, embeddings, custom fields. Brotli-compressed (`.br`) when > 1KB |
| `documentTree.json` | **Logical Layer**. Document tree (schema v2): root with sections, each section with block children. JSON |
| `versions/delta-N.jsonpatch` | Operation logs for undo/redo (JSON Patch format) |
| `assets/<filename>` | Binary files for images (PNG, JPEG, etc.) |
| `assets/rels.json` | Asset metadata: `targetPos`, `alt`, `size` per asset name |

### Piece Table (content.cbor)

The buffer uses a **piece table** structure:

- **baseText**: Initial/original text string
- **chunks**: Array of operations applied on top:
  - `{ type: "insert", pos: number, data: string }`
  - `{ type: "delete", pos: number, len: number }`

The effective text is computed by applying chunks to baseText. All text (paragraphs, table cells) and object placeholders live in this single buffer.

---

## 2. Domain Model (In-Memory Structure)

The document is modeled as a tree of nodes. The root contains **sections**; each section contains **blocks**.

### Root

- **Document**: `id`, `sections[]`, `buffer` (TextBuffer), `createdAt`, `modifiedAt`
- **Tree**: `{ version: 2, root: { children: Section[] } }`

### Section

- **Section**: `id`, `type: "section"`, `children: Block[]`, optional `layout: SectionLayout`
- **SectionLayout** (optional): margins, orientation (portrait/landscape), pageSize, columns, columnGap, headers, footers

### Block Types

| Type | Description |
|------|-------------|
| **Paragraph** | `textRange`, `marks` (FormattingMark[]), optional `textAlign` |
| **Heading** | Same as Paragraph + `level: 1 | 2 | 3` |
| **Image** | `bufferPosition` (single offset), `assetRef`, `alt`, `size: [width, height]` |
| **Table** | `textRange`, `rows` (TableCell[]), `colWidths`. Cells contain Paragraph/Heading children |
| **List** | `listType: "ordered" \| "unordered"`, `items` (each with `content: Paragraph \| Heading`) |
| **Blockquote** | `children: (Paragraph \| Heading)[]` |

### Buffer References

- **Text blocks** (Paragraph, Heading): `textRange: BufferRange` — absolute `[start, end)` in the global buffer
- **Table**: `textRange` spans all cells. Cell contents use `\t` (tab) and `\n` (newline) in buffer; table cells use `U+FFFC` (Object Replacement Character) as cell separator
- **Image**: `bufferPosition` — single character position; the placeholder `U+FFFC` occupies this slot in the buffer

### Inline Formatting (Marks)

- **FormattingMark**: `{ start, end }` (offsets **relative to the block**), `attrs: TextAttributes`
- **TextAttributes**: `bold`, `italic`, `font`, `fontSize`
- Marks use **relative offsets** so local edits do not require updating marks in other blocks

---

## 3. Offset Management

- **Blocks**: Use **absolute offsets** to reference the global buffer (`textRange.start`, `textRange.end`)
- **Marks (inline styles)**: Use **relative offsets** within their parent block
- **Object placeholders**: Images use `U+FFFC` at a single buffer position; tables use `U+FFFC` as cell separator in row-major layout

---

## 4. Rendering & Input

- **Model-first (controlled contentEditable)**: The DOM is a projection of the document model
- User input is intercepted (`beforeinput`, `keydown`) and applied to the model via `EditorService`
- The view is re-rendered from the model on each change; selection is restored after render

---

## 5. Persistence Payload (DocumentPayload)

The payload sent to/from storage (Tauri `save_grokedoc` / `load_grokedoc`):

```ts
{
  baseText: string;
  chunks: PieceChunk[];
  metadata: { custom?: Record<string, unknown> };
  versions: unknown[];
  assets: AssetRef[];
  documentTree: { version: 2; root: { children: Section[] } };
}
```

`AssetRef`: `{ name, targetPos, alt, size: [w,h], bytes }`

---

## Consequences

### Advantages

- **Piece table**: Efficient for large documents; inserts/deletes are O(chunks) rather than shifting a monolithic string
- **Relative marks**: Local edits avoid cascading updates to marks in other blocks
- **Explicit block types**: Paragraph, Heading, List, Table, Image, Blockquote enable semantic features and export
- **ZIP + checksums**: Integrity validation and granular file access

### Trade-offs

- **Complexity**: Tree and buffer must stay synchronized during edits; range shifting is non-trivial
- **Learning curve**: Developers must distinguish absolute buffer positions from relative mark offsets

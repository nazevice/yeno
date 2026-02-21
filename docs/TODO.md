# Yeno Editor – Remaining Work

## Spec Alignment

- [ ] **History as Operations**: Spec says versions store Operations (e.g. "Insert Text", "Split Node"), not full snapshots. Current implementation uses tree+content snapshots.
- [ ] **Section columns**: Add `columns` property to `SectionNode` per spec.
- [ ] **Inline format (bold/italic)**: `_applyFormat` is a stub; wire InlineMark into paragraph/heading nodes.
- [ ] **insertBlock / deleteBlock**: Implement block insertion and deletion in EditorEngine (split node, merge, etc.).

## Buffer & Rendering

- [x] **U+FFFC sentinels**: Images now insert `\uFFFC` into the buffer and use `bufferPosition`. ✓
- [ ] **Table cell mapping**: Spec says TableNode "maps sub-ranges to specific cells". Current implementation splits buffer text by `\n`/`\t`; may need explicit cell→range mapping.
- [ ] **Inline images**: Spec allows images as inline objects. Current model uses block-level `ImageNode`. Consider `inlineObjects` on ParagraphNode for inline images.

## Storage

- [x] **Rust `document_tree_bytes`**: Fixed undefined variable in `zip_container.rs`. ✓
- [ ] **Verify Rust build**: Run `cargo build` to confirm storage compiles.

## Editor UX

- [ ] **insertTable**: `EditorApi.insertTable` is a stub; implement table insertion via engine.
- [ ] **Asset size on load**: When loading images, populate `assetRef.size` from actual dimensions.

## Spec Reference

See `docs/fileformat.md` for the full Document Architecture & File Format spec.

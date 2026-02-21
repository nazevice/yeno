# ADR: Document Architecture & File Format Specification

## Status
**Accepted**

## Context
We are building a high-performance document editor competitive with Microsoft Word and Google Docs. The system requires a robust architecture that supports complex page layouts (sections, headers/footers), rich semantics (nested lists, tables), and efficient real-time editing. The architecture must define how data is stored, modeled in memory, and rendered to the screen.

## Decision

We adopt a **Tree-over-Buffer** architecture. This separates the *Physical Storage* (raw text) from the *Logical Structure* (layout and semantics).

### 1. File Format (Storage)
The document is stored as a **ZIP archive** to allow granular access to resources and efficient delta syncing.

*   **`manifest.json`**: Schema version and file metadata.
*   **`content.cbor`**: **Physical Layer**. Contains the raw text content stored as a Piece Table, **CBOR encoded**. It is structure-agnostic. All text and object placeholders (`U+FFFC`) live in this buffer.
*   **`documentTree.json`**: **Logical Layer**. Contains the hierarchical Document Tree. Nodes reference the buffer via absolute character offsets.
*   **`metadata.json`**: Document metadata (ranges, embeddings, custom fields).
*   **`assets/`**: Binary files for images and embedded objects.
*   **`versions/`**: Operation logs for undo/redo persistence (e.g. `versions/delta-1.jsonpatch`).

### 2. Domain Model (In-Memory Structure)
The document is modeled as a tree of nodes, strictly separating layout containers from content blocks.

*   **Root (`DocumentNode`)**: Contains a flat list of `SectionNode`s.
*   **Layout (`SectionNode`)**: An explicit container for page geometry and layout.
    *   **Properties**: Page size, orientation, margins, columns, and headers/footers.
    *   **Rationale**: Layout properties (e.g., orientation) do not nest physically. A page cannot be simultaneously portrait and landscape. Sections are therefore flat, non-nesting siblings.
*   **Content (`BlockNode`)**: Children of Sections. Types include:
    *   **`HeadingNode`**: A distinct node type (not a styled paragraph) to ensure semantic integrity and valid table-of-contents generation.
    *   **`ParagraphNode`**: Holds text ranges and inline marks (bold/italic).
    *   **`ListNode`**: Contains `ListItemNode`s, which in turn contain `ParagraphNode`s. This allows lists to host rich content (images, nested lists) inside individual items.
    *   **`TableNode`**: A structural container. It owns a range in the buffer and maps sub-ranges to specific cells.

### 3. Buffer & Offset Management
*   **Text Storage**: All text (paragraphs, table cells) is stored contiguously in the single buffer, serialized as CBOR in `content.cbor`.
*   **Object Placeholders**: Non-text elements (Images, Tables) are represented in the buffer by **Sentinel Characters** (`U+FFFC`). This ensures every block has a unique, non-zero position in the buffer, solving ambiguous cursor positioning issues.
*   **Offsets**:
    *   **Nodes**: Use **Absolute Offsets** to reference the global buffer.
    *   **Marks (Inline Styles)**: Use **Relative Offsets** (relative to their parent Paragraph). This ensures local edits do not require updating marks in distant paragraphs.

### 4. History & State Management
*   **Undo/Redo**: Implements the **Command Pattern**.
    *   **Versions** in `versions/` store **Operations** (e.g., "Insert Text," "Split Node"), not full snapshots.
    *   **Rationale**: Operations are compact (low memory overhead) and allow for grouping edits into single user actions (e.g., typing a word is one undo step).
*   **Rendering**: **Model-First (Controlled ContentEditable)**.
    *   The DOM is a projection of the Tree and Buffer state.
    *   User input is intercepted (`beforeinput` event) to update the model; the view is then re-rendered programmatically. This ensures the Model remains the single source of truth.

## Consequences

### Advantages
*   **Professional Layouts**: The explicit `SectionNode` enables distinct headers/footers, page numbering, and orientation changes within a single document.
*   **Performance**: The Piece Table buffer handles large text volumes efficiently. Relative offsets for marks prevent cascading updates for local edits.
*   **Semantic Richness**: Distinct node types (Heading, List, Section) enable advanced features like automatic Table of Contents, DOCX export, and complex nesting without hacks.
*   **Scalability**: Storing operations in versions allows for deep undo stacks without excessive memory consumption.

### Trade-offs
*   **Complexity**: Requires strict synchronization logic between the Tree (Logical) and Buffer (Physical) layers during edits.
*   **Learning Curve**: Developers must understand the separation between absolute buffer positions and relative mark offsets.
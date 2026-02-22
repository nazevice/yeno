# Domain-Driven Design Implementation Plan

## Overview

This document outlines the complete implementation plan for restructuring the Yeno document editor using Domain-Driven Design principles. The plan follows a Big Bang rewrite approach, building production-ready code without backward compatibility constraints.

---

## 1. Configuration Updates

### 1.1 TypeScript Configuration

Update `tsconfig.json` with stricter settings:

```json
{
  "include": [
    "**/*",
    "**/.server/**/*",
    "**/.client/**/*",
    ".react-router/types/**/*"
  ],
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "types": ["node", "vite/client"],
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "rootDirs": [".", "./.react-router/types"],
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"]
    },
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 2. Directory Structure

### 2.1 New Domain Layer Structure

```
app/lib/
├── domain/
│   ├── shared/
│   │   ├── NodeId.ts              # Branded type for all node identifiers
│   │   └── types.ts               # Shared kernel types and utilities
│   │
│   ├── document/
│   │   ├── Document.ts            # Aggregate Root
│   │   ├── DocumentRepository.ts  # Repository interface
│   │   ├── DocumentSnapshot.ts    # Serializable state for persistence
│   │   ├── DocumentId.ts          # Document identifier value object
│   │   │
│   │   ├── buffer/
│   │   │   ├── TextBuffer.ts      # Piece table implementation
│   │   │   └── TextBufferTypes.ts # Piece chunk types
│   │   │
│   │   ├── entities/
│   │   │   ├── Section.ts         # Section entity
│   │   │   ├── Block.ts           # Block union type and base
│   │   │   ├── Paragraph.ts       # Paragraph entity
│   │   │   ├── Heading.ts         # Heading entity
│   │   │   ├── Table.ts           # Table entity
│   │   │   ├── Image.ts           # Image entity
│   │   │   ├── List.ts            # List and ListItem entities
│   │   │   └── Blockquote.ts      # Blockquote entity
│   │   │
│   │   ├── value-objects/
│   │   │   ├── BufferRange.ts     # Immutable text range
│   │   │   ├── FormattingMark.ts  # Inline formatting span
│   │   │   ├── TextAttributes.ts  # Bold, italic, font, fontSize
│   │   │   ├── SectionLayout.ts   # Margins, orientation
│   │   │   └── TextAlign.ts       # Text alignment enum
│   │   │
│   │   ├── events/
│   │   │   ├── DocumentEvent.ts   # Base event type
│   │   │   └── DocumentEvents.ts  # All domain events
│   │   │
│   │   └── operations/
│   │       └── DocumentCommands.ts # Command types for operations
│   │
│   ├── layout/                     # LayoutAndPrint context (placeholder)
│   │   └── README.md
│   │
│   └── collaboration/              # Collaboration context (placeholder)
│       └── README.md
│
├── application/
│   ├── EditorService.ts           # Main orchestrator
│   ├── HistoryManager.ts          # Undo/redo stack
│   ├── SelectionManager.ts        # Selection state
│   └── ActiveMarksManager.ts      # Typing format state
│
└── infrastructure/
    └── persistence/
        ├── TauriDocumentRepository.ts  # Repository implementation
        ├── DocumentMapper.ts           # DTO <-> Domain mapping
        └── types.ts                    # Persistence DTOs
```

---

## 3. Implementation Phases

### Phase 1: Shared Kernel & Value Objects

#### 3.1.1 `NodeId.ts`
Branded type for type-safe identifiers.

```
- NodeId.create(): NodeId
- NodeId.from(string): NodeId
- nodeId.equals(other): boolean
- nodeId.toString(): string
- BlockId, SectionId, DocumentId as type aliases
```

#### 3.1.2 `BufferRange.ts`
Immutable range for buffer positions.

```
- constructor(start: number, end: number) - validates start <= end
- range.length: number
- range.contains(pos: number): boolean
- range.shift(delta: number): BufferRange
- range.overlaps(other: BufferRange): boolean
- range.intersection(other: BufferRange): BufferRange | null
- range.isBefore(other: BufferRange): boolean
```

#### 3.1.3 `TextAttributes.ts`
Immutable formatting attributes.

```
- TextAttributes.empty: TextAttributes
- attrs.bold: boolean | undefined
- attrs.italic: boolean | undefined
- attrs.font: string | undefined
- attrs.fontSize: number | undefined
- attrs.withBold(value: boolean): TextAttributes
- attrs.withItalic(value: boolean): TextAttributes
- attrs.withFont(font: string): TextAttributes
- attrs.withFontSize(size: number): TextAttributes
- attrs.merge(other: TextAttributes): TextAttributes
- attrs.equals(other: TextAttributes): boolean
```

#### 3.1.4 `FormattingMark.ts`
Immutable formatting span with range and attributes.

```
- constructor(range: BufferRange, attrs: TextAttributes)
- mark.range: BufferRange
- mark.attrs: TextAttributes
- mark.shift(delta: number): FormattingMark
- mark.slice(range: BufferRange): FormattingMark | null
- mark.merge(other: FormattingMark): FormattingMark | null
```

#### 3.1.5 `SectionLayout.ts`
Section page layout settings.

```
- margins: { top, right, bottom, left }
- orientation: 'portrait' | 'landscape'
- headers: Record<string, string>
- footers: Record<string, string>
```

#### 3.1.6 `TextAlign.ts`
Text alignment enum.

```
type TextAlign = 'left' | 'center' | 'right' | 'justify'
```

---

### Phase 2: TextBuffer

#### 3.2.1 `TextBufferTypes.ts`
Piece table chunk types.

```
type ChunkType = 'original' | 'insert' | 'delete'

interface PieceChunk {
  type: ChunkType
  pos?: number
  data?: string
  len?: number
}

interface TextBufferContent {
  baseText: string
  chunks: PieceChunk[]
}
```

#### 3.2.2 `TextBuffer.ts`
Piece table implementation.

```
- TextBuffer.create(): TextBuffer
- TextBuffer.fromContent(content: TextBufferContent): TextBuffer
- buffer.insert(pos: number, text: string): void
- buffer.delete(pos: number, length: number): void
- buffer.getText(): string
- buffer.getRange(start: number, end: number): string
- buffer.length(): number
- buffer.toContent(): TextBufferContent
- buffer.replaceContent(content: TextBufferContent): void
```

---

### Phase 3: Entities

#### 3.3.1 `Block.ts`
Base types and discriminated union.

```
type BlockType = 'paragraph' | 'heading' | 'table' | 'image' | 'list' | 'blockquote'

interface BlockBase {
  id: BlockId
  type: BlockType
}

type Block = Paragraph | Heading | Table | Image | List | Blockquote
```

#### 3.3.2 `Paragraph.ts`
Paragraph entity.

```
interface Paragraph extends BlockBase {
  type: 'paragraph'
  textRange: BufferRange
  marks: FormattingMark[]
  textAlign?: TextAlign
}
```

#### 3.3.3 `Heading.ts`
Heading entity.

```
interface Heading extends BlockBase {
  type: 'heading'
  level: 1 | 2 | 3
  textRange: BufferRange
  marks: FormattingMark[]
  textAlign?: TextAlign
}
```

#### 3.3.4 `Table.ts`
Table entity.

```
interface Table extends BlockBase {
  type: 'table'
  textRange: BufferRange
  rows: number
  cols: number
}
```

#### 3.3.5 `Image.ts`
Image entity.

```
interface Image extends BlockBase {
  type: 'image'
  bufferPosition: number
  assetRef: AssetRef
  alt: string
  size: [number, number]
}

interface AssetRef {
  name: string
  targetPos: number
  alt: string
  size: [number, number]
  bytes: number[]
}
```

#### 3.3.6 `List.ts`
List and ListItem entities.

```
interface List extends BlockBase {
  type: 'list'
  listType: 'ordered' | 'unordered'
  items: ListItem[]
}

interface ListItem {
  id: BlockId
  type: 'listItem'
  content: Paragraph | Heading
}
```

#### 3.3.7 `Blockquote.ts`
Blockquote entity.

```
interface Blockquote extends BlockBase {
  type: 'blockquote'
  children: (Paragraph | Heading)[]
}
```

#### 3.3.8 `Section.ts`
Section entity.

```
interface Section {
  id: SectionId
  type: 'section'
  children: Block[]
  layout?: SectionLayout
}
```

---

### Phase 4: Domain Events

#### 3.4.1 `DocumentEvent.ts`
Base event type.

```
interface DocumentEvent {
  type: string
  timestamp: number
  documentId: DocumentId
}
```

#### 3.4.2 `DocumentEvents.ts`
All domain events.

| Event | Payload |
|-------|---------|
| `TextInserted` | `{ blockId, offset, text }` |
| `TextDeleted` | `{ blockId, offset, deletedText, length }` |
| `BlockSplit` | `{ originalBlockId, newBlockId, splitOffset }` |
| `BlocksMerged` | `{ survivingBlockId, deletedBlockId, mergedText, deletedMarks }` |
| `BlockInserted` | `{ parentSectionId, index, block }` |
| `BlockDeleted` | `{ blockId, deletedBlock }` |
| `BlockMoved` | `{ blockId, newParentId, newIndex, oldParentId, oldIndex }` |
| `TextFormatted` | `{ blockId, range, attrs }` |
| `BlockTypeChanged` | `{ blockId, oldType, newType }` |
| `SectionLayoutChanged` | `{ sectionId, layout }` |

---

### Phase 5: Document Aggregate

#### 3.5.1 `DocumentSnapshot.ts`
Serializable state.

```
interface DocumentSnapshot {
  id: DocumentId
  tree: DocumentTree
  bufferContent: TextBufferContent
  createdAt: number
  modifiedAt: number
}

interface DocumentTree {
  version: 2
  root: {
    children: Section[]
  }
}
```

#### 3.5.2 `Document.ts`
Aggregate Root with full implementation.

**Factory Methods:**
```
- Document.createEmpty(): Document
- Document.fromText(text: string): Document
- Document.reconstitute(snapshot: DocumentSnapshot): Document
```

**Queries:**
```
- document.id: DocumentId
- document.sections: readonly Section[]
- document.getBlock(blockId: BlockId): Block | null
- document.getSection(sectionId: SectionId): Section | null
- document.getText(blockId: BlockId): string
- document.getBlockRange(blockId: BlockId): BufferRange | null
- document.findBlockAtPosition(bufferOffset: number): { block: Block, localOffset: number } | null
- document.toSnapshot(): DocumentSnapshot
```

**Commands (return emitted events):**
```
- document.insertText(blockId: BlockId, offset: number, text: string): TextInserted
- document.deleteText(blockId: BlockId, offset: number, length: number): TextDeleted
- document.splitBlock(blockId: BlockId, offset: number): BlockSplit
- document.mergeBlocks(targetId: BlockId, sourceId: BlockId): BlocksMerged
- document.formatText(blockId: BlockId, range: BufferRange, attrs: TextAttributes): TextFormatted
- document.insertBlock(sectionId: SectionId, index: number, block: Block): BlockInserted
- document.deleteBlock(blockId: BlockId): BlockDeleted
- document.moveBlock(blockId: BlockId, newSectionId: SectionId, newIndex: number): BlockMoved
- document.changeBlockType(blockId: BlockId, newType: 'paragraph' | 'heading', level?: 1|2|3): BlockTypeChanged
- document.setSectionLayout(sectionId: SectionId, layout: SectionLayout): SectionLayoutChanged
```

**Invariant Enforcement (internal):**
```
- validateTreeBufferConsistency()
- validateUniqueIds()
- validateContiguousRanges()
- validateHierarchy()
- validateFormattingBounds()
```

**Private helpers:**
```
- shiftRangesAfter(position: number, delta: number): void
- shiftMarksAfter(block: Paragraph | Heading, position: number, delta: number): void
- generateId(): BlockId
```

---

### Phase 6: Repository Interface

#### 3.6.1 `DocumentRepository.ts`
Repository contract.

```
interface DocumentRepository {
  findById(id: DocumentId): Promise<Document | null>
  save(document: Document): Promise<void>
  delete(id: DocumentId): Promise<void>
  listVersions(id: DocumentId): Promise<VersionSummary[]>
}

interface VersionSummary {
  id: string
  versionNumber: number
  createdAt: string
  label?: string
  contentHash: string
  charCount: number
  lineCount: number
}
```

---

### Phase 7: Application Layer

#### 3.7.1 `HistoryManager.ts`
Undo/redo stack management.

```
class HistoryManager {
  get canUndo(): boolean
  get canRedo(): boolean
  
  push(entry: HistoryEntry): void
  undo(): HistoryEntry | null
  redo(): HistoryEntry | null
  clear(): void
}

interface HistoryEntry {
  inverseCommand: DocumentCommand
  selection: Selection | null
}
```

#### 3.7.2 `SelectionManager.ts`
Selection state management.

```
interface SelectionPoint {
  blockId: BlockId
  offset: number
}

interface Selection {
  anchor: SelectionPoint
  focus: SelectionPoint
}

class SelectionManager {
  get selection(): Selection | null
  setSelection(selection: Selection | null): void
  get isCollapsed(): boolean
  getStartPoint(): SelectionPoint | null
  getEndPoint(): SelectionPoint | null
}
```

#### 3.7.3 `ActiveMarksManager.ts`
Typing format state.

```
class ActiveMarksManager {
  get marks(): TextAttributes | null
  setMarks(marks: TextAttributes | null): void
  toggleBold(): void
  toggleItalic(): void
  setFont(font: string): void
  setFontSize(size: number): void
}
```

#### 3.7.4 `EditorService.ts`
Main orchestrator.

```
class EditorService {
  constructor(repository: DocumentRepository)
  
  // State
  get document(): Document | null
  get selection(): Selection | null
  get activeMarks(): TextAttributes | null
  get canUndo(): boolean
  get canRedo(): boolean
  get isDirty(): boolean
  
  // Document lifecycle
  newDocument(): void
  openDocument(id: DocumentId): Promise<void>
  saveDocument(): Promise<void>
  closeDocument(): void
  
  // Text operations
  insertText(text: string): void
  deleteText(length: number, direction: 'forward' | 'backward'): void
  backspace(): void
  delete(): void
  
  // Block operations
  splitBlock(): void
  mergeBlocks(): void
  insertParagraph(): void
  insertImage(asset: AssetRef): void
  deleteBlock(): void
  
  // Formatting
  formatText(attrs: TextAttributes): void
  setBlockType(type: 'paragraph' | 'heading', level?: 1|2|3): void
  setTextAlign(align: TextAlign): void
  
  // History
  undo(): void
  redo(): void
  
  // Selection
  setSelection(selection: Selection): void
  setSelectionFromOffsets(anchor: number, focus: number): void
  
  // Active marks
  setActiveMarks(marks: TextAttributes | null): void
  toggleBold(): void
  toggleItalic(): void
  
  // Subscriptions
  subscribe(listener: () => void): () => void
}
```

---

### Phase 8: Infrastructure Layer

#### 3.8.1 `types.ts`
Persistence DTOs.

```
interface DocumentPayload {
  baseText: string
  chunks: PieceChunk[]
  metadata: { custom?: Record<string, unknown> }
  versions: unknown[]
  assets: AssetRef[]
  documentTree: DocumentTree
}

interface SaveRequest {
  path: string
  payload: DocumentPayload
}
```

#### 3.8.2 `DocumentMapper.ts`
DTO <-> Domain mapping.

```
class DocumentMapper {
  static toDomain(payload: DocumentPayload): Document
  static toPayload(document: Document): DocumentPayload
  static toSnapshot(payload: DocumentPayload): DocumentSnapshot
}
```

#### 3.8.3 `TauriDocumentRepository.ts`
Repository implementation using Tauri backend.

```
class TauriDocumentRepository implements DocumentRepository {
  async findById(id: DocumentId): Promise<Document | null>
  async save(document: Document): Promise<void>
  async delete(id: DocumentId): Promise<void>
  async listVersions(id: DocumentId): Promise<VersionSummary[]>
}
```

---

### Phase 9: React Component Updates

#### 3.9.1 Update `EditorContext.tsx`

Replace `EditorEngine` with `EditorService`:

```
- Import EditorService from application layer
- Create EditorService instance in context
- Expose document, selection, activeMarks, canUndo, canRedo
- Expose command methods (insertText, formatText, etc.)
- Maintain subscription to EditorService changes
```

#### 3.9.2 Update `DocumentRenderer.tsx`

Adapt to new domain types:

```
- Accept Document from domain instead of DocumentTree + TextBuffer
- Use Block discriminated union for rendering
- Use BufferRange and FormattingMark value objects
- Update attribute rendering to use TextAttributes
```

#### 3.9.3 Update `PaginatedView.tsx`

No significant changes - layout calculation remains similar.

#### 3.9.4 Update `Toolbar.tsx`

Adapt to EditorService API:

```
- Use EditorService.formatText() instead of direct operations
- Use EditorService.toggleBold(), toggleItalic()
- Use EditorService.setBlockType()
- Query activeMarks from EditorService
```

#### 3.9.5 Update `ContentEditableRoot.tsx`

Adapt input handling:

```
- Use EditorService.insertText() for typing
- Use EditorService.backspace() / delete()
- Use EditorService.splitBlock() for Enter
- Use EditorService.mergeBlocks() for backspace at line start
- Update selection handling to use SelectionManager types
```

#### 3.9.6 Update `PaginationPlugin.tsx`

Adapt to new document structure:

```
- Subscribe to document changes via EditorService
- Use new Block types for page break detection
```

#### 3.9.7 Update `AssetsContext.tsx`

Adapt to new AssetRef type:

```
- Use domain AssetRef interface
- Update insertImage to use EditorService.insertImage()
```

---

### Phase 10: Cleanup

#### 3.10.1 Delete Obsolete Files

Delete the following files after successful migration:

| File | Reason |
|------|--------|
| `app/lib/doc/schema.ts` | Replaced by domain entities and value objects |
| `app/lib/doc/textBuffer.ts` | Replaced by `domain/document/buffer/TextBuffer.ts` |
| `app/lib/doc/editorEngine.ts` | Replaced by `Document` + `EditorService` |
| `app/lib/doc/treeUtils.ts` | Logic moved into `Document.ts` |
| `app/lib/doc/createEmptyDocument.ts` | Replaced by `Document.createEmpty()` |
| `app/lib/doc/uuid.ts` | Replaced by `NodeId.ts` |
| `app/lib/doc/deserialize.ts` | Will be replaced by import services |
| `app/lib/doc/serialize.ts` | Will be replaced by export services |
| `app/lib/doc/fonts.ts` | Move to `infrastructure/` or keep as utility |

#### 3.10.2 Update Imports

Update all import statements across the codebase to use new domain paths:

```
Old: import type { BlockNode } from "~/lib/doc/schema"
New: import type { Block } from "~/lib/domain/document/entities/Block"
```

---

## 4. Naming Conventions

| Domain Concept | TypeScript Name | Type |
|----------------|-----------------|------|
| Node identifier | `NodeId`, `BlockId`, `SectionId`, `DocumentId` | Branded string |
| Text range | `BufferRange` | Value Object |
| Formatting span | `FormattingMark` | Value Object |
| Formatting attributes | `TextAttributes` | Value Object |
| Block types | `Paragraph`, `Heading`, `Table`, `Image`, `List`, `Blockquote` | Entity |
| Section | `Section` | Entity |
| Document | `Document` | Aggregate Root |
| Events | `TextInserted`, `BlockSplit`, etc. | Domain Event |
| Commands | `InsertTextCommand`, `SplitBlockCommand`, etc. | Command |
| Selection | `Selection` | Value Object |
| Repository | `DocumentRepository` | Interface |

---

## 5. Invariants Reference

The Document Aggregate enforces these invariants at all times:

1. **Tree-Buffer Consistency**: Every block's `textRange` must point to valid buffer positions.
2. **Structural Integrity**: Every block belongs to exactly one parent (Section or ListItem).
3. **Contiguous Ranges**: Sibling blocks have non-overlapping, sequential ranges.
4. **Unique Identity**: Every NodeId is unique within the Document scope.
5. **Valid Hierarchy**: Blocks must be in valid parent containers (e.g., ListItem inside List).
6. **Formatting Bounds**: FormattingMark ranges must be contained within their parent block's range.

---

## 6. Execution Checklist

- [ ] Phase 1: Shared Kernel & Value Objects
- [ ] Phase 2: TextBuffer
- [ ] Phase 3: Entities
- [ ] Phase 4: Domain Events
- [ ] Phase 5: Document Aggregate
- [ ] Phase 6: Repository Interface
- [ ] Phase 7: Application Layer
- [ ] Phase 8: Infrastructure Layer
- [ ] Phase 9: React Component Updates
- [ ] Phase 10: Cleanup & Delete Obsolete Files
- [ ] Final: Run TypeScript compiler and fix any errors
- [ ] Final: Manual testing of core editing features

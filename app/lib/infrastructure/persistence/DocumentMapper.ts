import { Document } from "../../domain/document/Document";
import type { DocumentSnapshot } from "../../domain/document/DocumentSnapshot";
import type { DocumentPayload } from "./types";
import { BufferRange } from "../../domain/document/value-objects/BufferRange";
import { FormattingMark } from "../../domain/document/value-objects/FormattingMark";
import { TextAttributes } from "../../domain/document/value-objects/TextAttributes";
import { Section } from "../../domain/document/entities/Section";
import type { Block, Paragraph, Heading } from "../../domain/document/entities";
import type { FormattingMarkData } from "../../domain/document/value-objects/FormattingMark";
import { BlockId, SectionId, DocumentId } from "../../domain/shared/NodeId";

export class DocumentMapper {
  static toDomain(payload: DocumentPayload): Document {
    const snapshot = DocumentMapper.snapshotFromPayload(payload);
    return Document.reconstitute(snapshot);
  }

  static toPayload(document: Document): DocumentPayload {
    const snapshot = document.toSnapshot();
    return DocumentMapper.payloadFromSnapshot(snapshot);
  }

  static snapshotFromPayload(payload: DocumentPayload): DocumentSnapshot {
    const sections = payload.documentTree.root.children.map(s => 
      DocumentMapper.sectionFromData(s as Section)
    );

    return {
      id: DocumentId.from(payload.documentTree.root.children[0]?.id ?? ""),
      tree: {
        version: 2,
        root: { children: sections as Section[] },
      },
      bufferContent: {
        baseText: payload.baseText,
        chunks: payload.chunks,
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    };
  }

  static payloadFromSnapshot(snapshot: DocumentSnapshot): DocumentPayload {
    return {
      baseText: snapshot.bufferContent.baseText,
      chunks: [...snapshot.bufferContent.chunks],
      metadata: {},
      versions: [],
      assets: [],
      documentTree: {
        version: 2,
        root: { children: [...snapshot.tree.root.children] as Section[] },
      },
    };
  }

  private static sectionFromData(data: Section): Section {
    const children = data.children.map(b => DocumentMapper.blockFromData(b as Block));
    return Section.create(SectionId.from(data.id), children);
  }

  private static blockFromData(data: Block): Block {
    if (data.type === "paragraph") {
      const pData = data as Paragraph;
      return {
        ...pData,
        id: BlockId.from(pData.id),
        textRange: new BufferRange(pData.textRange.start, pData.textRange.end),
        marks: pData.marks?.map(m => DocumentMapper.markFromData(m.toJSON())) ?? [],
      } as Block;
    }
    if (data.type === "heading") {
      const hData = data as Heading;
      return {
        ...hData,
        id: BlockId.from(hData.id),
        textRange: new BufferRange(hData.textRange.start, hData.textRange.end),
        marks: hData.marks?.map(m => DocumentMapper.markFromData(m.toJSON())) ?? [],
      } as Block;
    }
    return { ...data, id: BlockId.from(data.id) } as Block;
  }

  private static markFromData(data: FormattingMarkData): FormattingMark {
    const range = new BufferRange(data.start, data.end);
    const attrs = data.attrs
      ? TextAttributes.from({
          bold: "b" in data.attrs ? data.attrs["b"] as boolean | undefined : undefined,
          italic: "i" in data.attrs ? data.attrs["i"] as boolean | undefined : undefined,
          font: "font" in data.attrs ? data.attrs["font"] as string | undefined : undefined,
          fontSize: "fontSize" in data.attrs ? data.attrs["fontSize"] as number | undefined : undefined,
        })
      : TextAttributes.empty;
    return new FormattingMark(range, attrs);
  }
}

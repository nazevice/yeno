import type { SectionId, BlockId } from "../../shared/NodeId";
import type { Block } from "./index";
import type { SectionLayout } from "../value-objects/SectionLayout";

export interface Section {
  readonly id: SectionId;
  readonly type: "section";
  readonly children: readonly Block[];
  readonly layout?: SectionLayout | undefined;
}

export namespace Section {
  export function create(id: SectionId, children: readonly Block[] = []): Section {
    return {
      id,
      type: "section",
      children,
    };
  }

  export function withChildren(section: Section, children: readonly Block[]): Section {
    return { ...section, children };
  }

  export function withLayout(section: Section, layout: SectionLayout | undefined): Section {
    return { ...section, layout };
  }

  export function findBlockById(section: Section, blockId: BlockId): Block | undefined {
    for (const block of section.children) {
      if (block.id === blockId) return block;
      if (block.type === "blockquote") {
        for (const child of block.children) {
          if (child.id === blockId) return child;
        }
      }
      if (block.type === "list") {
        for (const item of block.items) {
          if (item.content.id === blockId) return item.content;
        }
      }
    }
    return undefined;
  }

  export function findBlockIndex(section: Section, blockId: BlockId): number {
    return section.children.findIndex((block) => block.id === blockId);
  }
}

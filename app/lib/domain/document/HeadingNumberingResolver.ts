import type { BlockId } from "../shared/NodeId";
import type { Document } from "./Document";
import type { Block } from "./entities";
import { isHeading } from "./entities";

export interface HeadingInfo {
  id: BlockId;
  level: 1 | 2 | 3;
  number: string;
  text: string;
}

export function resolveHeadingNumbers(doc: Document): Map<BlockId, string> {
  const numberingMap = new Map<BlockId, string>();
  const counters = [0, 0, 0];

  for (const section of doc.sections) {
    for (const block of section.children) {
      if (isHeading(block)) {
        const levelIndex = block.level - 1;
        
        counters[levelIndex] = (counters[levelIndex] ?? 0) + 1;
        
        for (let i = levelIndex + 1; i < 3; i++) {
          counters[i] = 0;
        }
        
        const number = counters.slice(0, levelIndex + 1).join(".");
        numberingMap.set(block.id, number);
      }
    }
  }

  return numberingMap;
}

export function getHeadingList(doc: Document): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const counters = [0, 0, 0];
  const buffer = doc.getBuffer();

  for (const section of doc.sections) {
    for (const block of section.children) {
      if (isHeading(block)) {
        const levelIndex = block.level - 1;
        
        counters[levelIndex] = (counters[levelIndex] ?? 0) + 1;
        
        for (let i = levelIndex + 1; i < 3; i++) {
          counters[i] = 0;
        }
        
        const number = counters.slice(0, levelIndex + 1).join(".");
        const text = buffer.getRange(block.textRange.start, block.textRange.end);
        
        headings.push({
          id: block.id,
          level: block.level,
          number,
          text,
        });
      }
    }
  }

  return headings;
}

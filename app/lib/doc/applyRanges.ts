import { createRangeFromOffsets } from "~/components/editor/core/domSelection";
import type { MetadataRange } from "./schema";

export function applyMetadataRanges(
  root: HTMLElement,
  ranges: MetadataRange[],
): void {
  if (!ranges.length) return;

  const sorted = [...ranges].sort((a, b) => a.start - b.start);

  for (const range of sorted) {
    const font = range.attrs?.font;
    const fontSize = range.attrs?.fontSize;
    const hasFont = typeof font === "string" && font !== "";
    const hasFontSize = typeof fontSize === "string" && fontSize !== "";
    const bold = range.attrs?.b;
    const italic = range.attrs?.i;
    const headingLevel = range.type === "h" ? range.level : null;

    if (!hasFont && !hasFontSize && !bold && !italic && !headingLevel) continue;

    const domRange = createRangeFromOffsets(root, range.start, range.end);
    if (!domRange) continue;

    const sel = window.getSelection();
    if (!sel) continue;
    sel.removeAllRanges();
    sel.addRange(domRange);

    if (headingLevel) {
      const container = domRange.commonAncestorContainer;
      let block: HTMLElement | null =
        container.nodeType === Node.TEXT_NODE
          ? (container.parentElement as HTMLElement)
          : (container as HTMLElement);
      while (block && block !== root) {
        const tag = block.tagName;
        if (["P", "H1", "H2", "H3", "DIV"].includes(tag)) {
          const newTag = `h${headingLevel}` as "h1" | "h2" | "h3";
          if (tag !== newTag.toUpperCase()) {
            const wrapper = document.createElement(newTag);
            wrapper.innerHTML = block.innerHTML;
            block.parentNode?.replaceChild(wrapper, block);
          }
          break;
        }
        block = block.parentElement;
      }
    } else {
      const fragment = domRange.extractContents();
      let node: DocumentFragment | HTMLElement = fragment;
      if (italic) {
        const em = document.createElement("em");
        em.appendChild(node);
        node = em;
      }
      if (bold) {
        const strong = document.createElement("strong");
        strong.appendChild(node);
        node = strong;
      }
      if (hasFont || hasFontSize) {
        const span = document.createElement("span");
        const styles: string[] = [];
        if (hasFont) styles.push(`font-family: ${font}`);
        if (hasFontSize) styles.push(`font-size: ${fontSize}`);
        span.style.cssText = styles.join("; ");
        span.appendChild(node);
        node = span;
      }
      domRange.insertNode(node);
    }

    sel.removeAllRanges();
  }
}

import type { ClipboardPayload, ClipboardTextBlock, ClipboardImageBlock } from "./ClipboardPayload";
import type { FormattingMarkData } from "../document/value-objects/FormattingMark";
import type { TextAttributesData } from "../document/value-objects/TextAttributes";

export function serializeToHtml(payload: ClipboardPayload): string {
  const htmlParts: string[] = [];
  
  for (const block of payload.blocks) {
    htmlParts.push(serializeBlock(block));
  }
  
  return htmlParts.join("\n");
}

function serializeBlock(block: ClipboardPayload["blocks"][number]): string {
  if (block.type === "image") {
    return serializeImageBlock(block);
  }
  return serializeTextBlock(block);
}

function serializeTextBlock(block: ClipboardTextBlock): string {
  const htmlContent = serializeTextWithMarks(block.text, block.marks);
  const textAlign = block.textAlign ? ` style="text-align: ${block.textAlign}"` : "";
  
  if (block.type === "heading") {
    const level = block.level ?? 1;
    return `<h${level} data-type="heading" data-level="${level}"${textAlign}>${htmlContent}</h${level}>`;
  }
  
  return `<p data-type="paragraph"${textAlign}>${htmlContent}</p>`;
}

function serializeImageBlock(block: ClipboardImageBlock): string {
  const base64 = btoa(String.fromCharCode(...block.bytes));
  const ext = block.assetName.split(".").pop()?.toLowerCase() ?? "png";
  const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
  
  return `<img src="data:${mime};base64,${base64}" alt="${escapeHtml(block.alt)}" data-type="image" data-width="${block.size[0]}" data-height="${block.size[1]}" />`;
}

function serializeTextWithMarks(text: string, marks: FormattingMarkData[]): string {
  if (marks.length === 0 || text.length === 0) {
    return escapeHtml(text);
  }
  
  const charAnnotations: Array<{ bold?: boolean; italic?: boolean; underline?: boolean; font?: string; fontSize?: number }> = [];
  for (let i = 0; i < text.length; i++) {
    charAnnotations.push({});
  }
  
  for (const mark of marks) {
    for (let i = mark.start; i < mark.end && i < text.length; i++) {
      if (mark.attrs?.bold !== undefined) charAnnotations[i]!.bold = mark.attrs.bold;
      if (mark.attrs?.italic !== undefined) charAnnotations[i]!.italic = mark.attrs.italic;
      if (mark.attrs?.underline !== undefined) charAnnotations[i]!.underline = mark.attrs.underline;
      if (mark.attrs?.font !== undefined) charAnnotations[i]!.font = mark.attrs.font;
      if (mark.attrs?.fontSize !== undefined) charAnnotations[i]!.fontSize = mark.attrs.fontSize;
    }
  }
  
  const segments: Array<{ text: string; attrs: TextAttributesData }> = [];
  let currentText = "";
  let currentAttrs: TextAttributesData = {};
  
  for (let i = 0; i < text.length; i++) {
    const attrs = charAnnotations[i]!;
    const attrsKey = JSON.stringify(attrs);
    const currentKey = JSON.stringify(currentAttrs);
    
    if (attrsKey !== currentKey && currentText.length > 0) {
      segments.push({ text: currentText, attrs: currentAttrs });
      currentText = "";
    }
    
    currentText += text[i];
    currentAttrs = attrs;
  }
  
  if (currentText.length > 0) {
    segments.push({ text: currentText, attrs: currentAttrs });
  }
  
  return segments.map((seg) => wrapWithMarks(seg.text, seg.attrs)).join("");
}

function wrapWithMarks(text: string, attrs: TextAttributesData): string {
  let result = escapeHtml(text);
  
  if (attrs.underline) {
    result = `<u>${result}</u>`;
  }
  if (attrs.italic) {
    result = `<em>${result}</em>`;
  }
  if (attrs.bold) {
    result = `<strong>${result}</strong>`;
  }
  
  const styles: string[] = [];
  if (attrs.font) {
    styles.push(`font-family: ${escapeHtml(attrs.font)}`);
  }
  if (attrs.fontSize) {
    styles.push(`font-size: ${attrs.fontSize}px`);
  }
  
  if (styles.length > 0) {
    result = `<span style="${styles.join("; ")}">${result}</span>`;
  }
  
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

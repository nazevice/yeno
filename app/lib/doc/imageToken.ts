/**
 * Shared utilities for image tokens in the format ![alt](asset://name) or ![alt](asset://name#WxH).
 * Single source of truth for parsing and serializing image references.
 */

/** Matches ![alt](asset://name) or ![alt](asset://name#WxH) - optional #WxH for dimensions */
export const IMAGE_TOKEN_REGEX = /!\[([^\]]*)\]\(asset:\/\/([^#)]+)(?:#(\d+)x(\d+))?\)/g;

export interface ImageTokenMatch {
  alt: string;
  name: string;
  width?: number;
  height?: number;
  fullMatch: string;
}

/**
 * Extracts alt, name, and optional dimensions from a regex match.
 * Call with match from IMAGE_TOKEN_REGEX.exec()
 */
export function parseImageToken(match: RegExpExecArray): ImageTokenMatch {
  const alt = match[1] ?? "";
  const name = match[2] ?? "";
  const width = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const height = match[4] ? Number.parseInt(match[4], 10) : undefined;
  return {
    alt,
    name,
    width: Number.isNaN(width) ? undefined : width,
    height: Number.isNaN(height) ? undefined : height,
    fullMatch: match[0],
  };
}

/**
 * Builds the canonical token string.
 */
export function toImageToken(
  name: string,
  alt: string,
  width?: number,
  height?: number,
): string {
  const altText = alt || name;
  const dims = width != null && height != null ? `#${width}x${height}` : "";
  return `![${altText}](asset://${name}${dims})`;
}

export interface LineSegment {
  type: "text" | "image";
  value: string;
  alt?: string;
  name?: string;
  width?: number;
  height?: number;
}

/**
 * Splits a line into segments of text and image tokens.
 * Image segments have alt and name populated.
 */
export function splitLineByImageTokens(line: string): LineSegment[] {
  const segments: LineSegment[] = [];
  const regex = new RegExp(IMAGE_TOKEN_REGEX.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: line.slice(lastIndex, match.index),
      });
    }
    const parsed = parseImageToken(match);
    segments.push({
      type: "image",
      value: parsed.fullMatch,
      alt: parsed.alt,
      name: parsed.name,
      width: parsed.width,
      height: parsed.height,
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    segments.push({
      type: "text",
      value: line.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: line }];
}

/**
 * Shared utilities for image tokens in the format ![alt](asset://name).
 * Single source of truth for parsing and serializing image references.
 */

/** Matches ![alt](asset://name) - alt can contain any chars except ]; name can contain any chars except ) */
export const IMAGE_TOKEN_REGEX = /!\[([^\]]*)\]\(asset:\/\/([^)]+)\)/g;

export interface ImageTokenMatch {
  alt: string;
  name: string;
  fullMatch: string;
}

/**
 * Extracts alt and name from a regex match.
 * Call with match from IMAGE_TOKEN_REGEX.exec()
 */
export function parseImageToken(match: RegExpExecArray): ImageTokenMatch {
  const alt = match[1] ?? "";
  const name = match[2] ?? "";
  return {
    alt,
    name,
    fullMatch: match[0],
  };
}

/**
 * Builds the canonical token string.
 */
export function toImageToken(name: string, alt: string): string {
  const altText = alt || name;
  return `![${altText}](asset://${name})`;
}

export interface LineSegment {
  type: "text" | "image";
  value: string;
  alt?: string;
  name?: string;
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

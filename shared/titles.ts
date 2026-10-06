/**
 * NORM-1: lowercase, trim, collapse whitespace, consistent spacing around `+`, `-` and `/`.
 * A hyphen inside a word (`pre-workout`) is left alone; only a hyphen that already touches a space
 * is treated as a separator (`jp- srs` → `jp - srs`).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*([+/])\s*/g, ' $1 ')
    .replace(/\s+-\s*|\s*-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

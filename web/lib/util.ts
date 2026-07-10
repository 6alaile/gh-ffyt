/** Safe filename helper. Strips path separators + non-safe chars, enforces .md. */
export function sanitizeBriefFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || "brief.md";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_");
  return cleaned.toLowerCase().endsWith(".md") ? cleaned : cleaned + ".md";
}

/** First 7 chars of a sha, lowercase. Used as a short upload id. */
export function shortId(sha: string): string {
  return sha.slice(0, 7).toLowerCase();
}
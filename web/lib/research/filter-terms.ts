/**
 * filter-terms.ts — derive relevance-filter terms for research fetches.
 *
 * Previously, buildRedditBundle() was always called with
 * (formData.teams || "").split(","), which is empty for any mode whose
 * form doesn't have a Teams field (Quick, Topic Only). An empty term
 * list turns the Reddit query into a generic "football" search AND
 * disables the RSS relevance filter entirely (see reddit-bundle.ts —
 * the filter only applies when searchTerms.length > 0), letting
 * unrelated stories through as if they were about the actual video's
 * subject.
 *
 * This derives terms from whatever input a given mode actually
 * collected, so every mode gets a real filter:
 *   - Explicit Teams input (when present) wins outright — it's the
 *     user deliberately naming who/what to emphasize.
 *   - Otherwise, significant words are pulled from the title, key
 *     moments, and/or transcript — whichever exist for that mode.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "vs", "v", "against", "match", "day", "matchday",
  "recap", "analysis", "breakdown", "week", "season", "and", "of", "in",
  "on", "at", "to", "for", "with", "is", "are", "was", "were", "this",
  "that", "it", "its", "md", "team", "teams", "game", "games",
]);

const MAX_DERIVED_TERMS = 6;

export function deriveFilterTerms({
  teams,
  matchTitle,
  keyMoments,
  transcript,
}: {
  teams?: string;
  matchTitle?: string;
  keyMoments?: string;
  transcript?: string;
}): string[] {
  const explicit = (teams || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Explicit teams/emphasis input always wins — it's what the user
  // deliberately typed to steer relevance, so don't dilute it with
  // derived terms from other fields.
  if (explicit.length > 0) return explicit;

  const text = [matchTitle, keyMoments, transcript].filter(Boolean).join(" ");
  if (!text.trim()) return [];

  const words = text
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(w);
    if (terms.length >= MAX_DERIVED_TERMS) break;
  }
  return terms;
}

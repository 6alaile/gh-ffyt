/**
 * Evidence-grounding contract for research-backed briefs — TS mirror of
 * src/pipeline/evidence.py. Field names and error semantics are kept
 * identical on purpose so a claim built in one runtime validates the
 * same way in the other.
 *
 * Two source bundle kinds feed different brief use cases:
 * - "reddit" bundle (Reddit r/soccer threads + RSS + Google Trends) -> matchweek recaps
 * - "fbref" bundle (FBref/Transfermarkt/Wikipedia) -> player bios, team deep
 *   dives, AND fact-checking/context for matchweek recaps.
 *
 * This exists because the current brief fallback (buildMarkdownBrief in
 * app/api/brief/route.ts) emits specific invented stats when no LLM is
 * configured. Any claim that runs through validateClaims() cannot do that:
 * every "observed" claim must cite a source that was actually fetched.
 */

export const BUNDLE_KINDS = ["reddit", "fbref"] as const;
export type BundleKind = (typeof BUNDLE_KINDS)[number];

export const SOURCE_KINDS = [
  "reddit_thread",
  "rss_article",
  "google_trends",
  "fbref_stat",
  "transfermarkt_profile",
  "wikipedia_extract",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

// "observed": directly stated by a cited source.
// "inferred": a reasonable read of observed claims, not stated outright.
// "requires_verification": a claim the creator wants to make but no
//   fetched source confirms yet — allowed to exist, but callers should
//   block it from reaching a final script.
export const EVIDENCE_CLASSES = ["observed", "inferred", "requires_verification"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export type EvidenceClaim = {
  id: string;
  text: string;
  evidence_class: EvidenceClass;
  source_ids: string[];
  snapshot_id: string;
};

export class EvidenceError extends Error {}

/** Deterministic ID binding a set of sources to the moment they were fetched. */
export function bundleSnapshotId(
  bundleKind: BundleKind,
  sourceIds: string[],
  retrievedAt: string
): string {
  if (!BUNDLE_KINDS.includes(bundleKind)) {
    throw new EvidenceError(`unknown bundle_kind ${bundleKind}, expected one of ${BUNDLE_KINDS.join(", ")}`);
  }
  const identity = JSON.stringify({
    bundle_kind: bundleKind,
    source_ids: [...sourceIds].sort(),
    retrieved_at: retrievedAt,
  });
  const digest = sha256Hex(identity).slice(0, 32);
  return `ev_${bundleKind}_${digest}`;
}

/** Validate a single evidence claim in isolation. Throws EvidenceError on the first problem. */
export function validateClaim(claim: EvidenceClaim): void {
  for (const field of ["id", "text", "evidence_class", "source_ids", "snapshot_id"] as const) {
    if (claim[field] === undefined || claim[field] === null) {
      throw new EvidenceError(`claim: missing required field '${field}'`);
    }
  }
  if (!EVIDENCE_CLASSES.includes(claim.evidence_class)) {
    throw new EvidenceError(
      `claim ${claim.id}: unknown evidence_class '${claim.evidence_class}', expected one of ${EVIDENCE_CLASSES.join(", ")}`
    );
  }
  if (claim.evidence_class === "observed" && claim.source_ids.length === 0) {
    throw new EvidenceError(
      `claim ${claim.id}: evidence_class 'observed' requires at least one source_id ` +
        `(use 'inferred' or 'requires_verification' if no fetched source backs this claim)`
    );
  }
}

/**
 * Validate a full set of claims against the sources actually retrieved for this brief.
 * Rejects claims citing an unfetched source_id, or carrying a stale snapshot_id.
 */
export function validateClaims(
  claims: EvidenceClaim[],
  allowedSourceIds: string[],
  allowedSnapshotId: string
): void {
  const allowedSources = new Set(allowedSourceIds);
  for (const claim of claims) {
    validateClaim(claim);
    if (claim.snapshot_id !== allowedSnapshotId) {
      throw new EvidenceError(
        `claim ${claim.id}: snapshot_id '${claim.snapshot_id}' does not match active snapshot '${allowedSnapshotId}' (stale evidence)`
      );
    }
    const unsupported = claim.source_ids.filter((sid) => !allowedSources.has(sid));
    if (unsupported.length > 0) {
      throw new EvidenceError(`claim ${claim.id}: cites source_ids not in the active bundle: ${unsupported.join(", ")}`);
    }
  }
}

// Minimal sync SHA-256 hex digest using Node's crypto — kept local to avoid
// pulling a hashing dependency into web/ for one function.
function sha256Hex(input: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

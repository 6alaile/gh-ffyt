import { bundleSnapshotId } from "../evidence";
import { fetchRedditThreads, fetchRssArticles } from "./reddit-bundle";
import { fetchFbrefStats, fetchWikipediaSummary } from "./fbref-bundle";
import { fetchTransfermarktProfile, searchTransfermarktProfileUrl } from "./transfermarkt";
import type { FetchImpl, ResearchBundle } from "./types";

/** Matchweek-recap sources: Reddit r/soccer + BBC/ESPN RSS. */
export async function buildRedditBundle(
  teams: string[],
  fetchImpl: FetchImpl = fetch
): Promise<ResearchBundle> {
  const [reddit, rss] = await Promise.all([
    fetchRedditThreads(teams, fetchImpl),
    fetchRssArticles(teams, fetchImpl),
  ]);
  const sources = [...reddit.sources, ...rss.sources];
  const observations = [...reddit.observations, ...rss.observations];
  const retrievedAt = new Date().toISOString();

  return {
    bundleKind: "reddit",
    sources,
    observations,
    retrievedAt,
    snapshotId: bundleSnapshotId(
      "reddit",
      sources.map((s) => s.id),
      retrievedAt
    ),
  };
}

/**
 * Player-bio / team-deep-dive sources, and a verification layer usable
 * against matchweek-recap claims. All three inputs are optional so
 * callers can fetch just what they need (e.g. Wikipedia-only to verify
 * a scoreline, without a full stats pull).
 *
 * `transfermarktPlayerNames` resolves via search (best-effort — see
 * transfermarkt.ts doc comment on name-collision risk). Pass
 * `transfermarktProfileUrls` directly instead when you already have the
 * exact profile URL and need precision.
 */
export async function buildFbrefBundle(
  wikipediaTitles: string[],
  fbrefUrls: string[],
  fetchImpl: FetchImpl = fetch,
  transfermarktPlayerNames: string[] = [],
  transfermarktProfileUrls: string[] = []
): Promise<ResearchBundle> {
  const wikiResults = await Promise.all(wikipediaTitles.map((t) => fetchWikipediaSummary(t, fetchImpl)));
  const fbrefResults = await Promise.all(fbrefUrls.map((u) => fetchFbrefStats(u, fetchImpl)));

  const resolvedFromNames = await Promise.all(
    transfermarktPlayerNames.map((name) => searchTransfermarktProfileUrl(name, fetchImpl))
  );
  const allTmUrls = [...transfermarktProfileUrls, ...resolvedFromNames.filter((u): u is string => u !== null)];
  const tmResults = await Promise.all(allTmUrls.map((u) => fetchTransfermarktProfile(u, fetchImpl)));

  const sources = [...wikiResults, ...fbrefResults, ...tmResults].flatMap((r) => r.sources);
  const observations = [...wikiResults, ...fbrefResults, ...tmResults].flatMap((r) => r.observations);
  const retrievedAt = new Date().toISOString();

  return {
    bundleKind: "fbref",
    sources,
    observations,
    retrievedAt,
    snapshotId: bundleSnapshotId(
      "fbref",
      sources.map((s) => s.id),
      retrievedAt
    ),
  };
}

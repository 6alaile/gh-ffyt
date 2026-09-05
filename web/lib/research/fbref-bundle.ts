/**
 * fbref-bundle.ts — player bio / team deep-dive sources, and a
 * verification layer for matchweek-recap claims (a Reddit-sourced stat
 * can be cross-checked here before it's allowed into a script).
 *
 * Wikipedia: REST summary API — clean JSON, no scraping, no key.
 *   https://en.wikipedia.org/api/rest_v1/page/summary/<title>
 *
 * FBref: HTML table scrape. FBref's tables use a stable, long-documented
 * `data-stat="..."` attribute convention (e.g. data-stat="goals"), which
 * is what this extractor targets rather than CSS classes that change
 * with site redesigns.
 *
 * CAVEAT: this sandbox can't reach fbref.com or transfermarkt.com to
 * validate the extractor against live HTML (network egress is
 * allowlisted to package registries only). The Wikipedia and Reddit/RSS
 * paths above were verified against realistic mocked responses matching
 * their real, documented API shapes. This one should be smoke-tested
 * against a real FBref page before you rely on it in production —
 * flagging rather than presenting it as equally verified.
 */

import type { BundleSource, FetchImpl, Observation } from "./types";

export async function fetchWikipediaSummary(
  title: string,
  fetchImpl: FetchImpl
): Promise<{ sources: BundleSource[]; observations: Observation[] }> {
  const sources: BundleSource[] = [];
  const observations: Observation[] = [];
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { sources, observations };
    const data = await res.json();
    if (!data?.extract) return { sources, observations };

    const sourceId = `wikipedia_extract_${slug(title)}`;
    sources.push({
      id: sourceId,
      kind: "wikipedia_extract",
      url: data.content_urls?.desktop?.page ?? url,
      title: data.title ?? title,
    });
    observations.push({ sourceId, text: data.extract.slice(0, 500) });
  } catch {
    // No source -> no observation. Never fabricate a bio detail.
  }

  return { sources, observations };
}

const FBREF_STATS = ["goals", "assists", "games", "minutes", "cards_yellow", "cards_red"] as const;

export async function fetchFbrefStats(
  playerOrTeamUrl: string,
  fetchImpl: FetchImpl
): Promise<{ sources: BundleSource[]; observations: Observation[] }> {
  const sources: BundleSource[] = [];
  const observations: Observation[] = [];

  try {
    const res = await fetchImpl(playerOrTeamUrl);
    if (!res.ok) return { sources, observations };
    const html = await res.text();

    const stats = extractFbrefStats(html);
    if (Object.keys(stats).length === 0) return { sources, observations };

    const sourceId = `fbref_stat_${slug(playerOrTeamUrl)}`;
    sources.push({ id: sourceId, kind: "fbref_stat", url: playerOrTeamUrl, title: "FBref stats" });
    const summary = Object.entries(stats)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    observations.push({ sourceId, text: summary });
  } catch {
    // Skip on any fetch/parse failure.
  }

  return { sources, observations };
}

/** Pull the most recent row's data-stat cells from the first stats table found. */
function extractFbrefStats(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const stat of FBREF_STATS) {
    const matches = [...html.matchAll(new RegExp(`data-stat="${stat}"[^>]*>([^<]*)<`, "g"))];
    if (matches.length === 0) continue;
    const lastValue = matches[matches.length - 1][1].trim();
    if (lastValue) result[stat] = lastValue;
  }
  return result;
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 48);
}

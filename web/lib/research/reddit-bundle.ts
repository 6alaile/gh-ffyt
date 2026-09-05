/**
 * reddit-bundle.ts — matchweek-recap sources: Reddit r/soccer + RSS.
 *
 * Reddit: uses the public, unauthenticated JSON search endpoint
 * (www.reddit.com/r/soccer/search.json). No REDDIT_CLIENT_ID/SECRET needed —
 * a custom User-Agent is required or Reddit returns 429s, that's the only
 * requirement. This is simpler than the old Python module's OAuth (praw)
 * approach and still free.
 *
 * RSS: BBC Sport + ESPN football feeds, filtered by team name match.
 */

import type { BundleSource, FetchImpl, Observation } from "./types";

const USER_AGENT = "md2yt-research/1.0 (by /u/md2yt)";

const RSS_FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.espn.com/espn/rss/soccer/news",
];

export async function fetchRedditThreads(
  teams: string[],
  fetchImpl: FetchImpl,
  limit = 5
): Promise<{ sources: BundleSource[]; observations: Observation[] }> {
  const query = teams.join(" ") || "football";
  const url = `https://www.reddit.com/r/soccer/search.json?q=${encodeURIComponent(
    query
  )}&restrict_sr=1&sort=new&limit=${limit}`;

  const sources: BundleSource[] = [];
  const observations: Observation[] = [];

  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return { sources, observations };
    const data = await res.json();
    const children: any[] = data?.data?.children ?? [];

    for (const child of children) {
      const post = child?.data;
      if (!post?.id || !post?.title) continue;
      const sourceId = `reddit_thread_${post.id}`;
      sources.push({
        id: sourceId,
        kind: "reddit_thread",
        url: `https://reddit.com${post.permalink ?? ""}`,
        title: post.title,
      });
      if (post.selftext && post.selftext.length > 20) {
        observations.push({ sourceId, text: post.selftext.slice(0, 300) });
      } else {
        // Title-only threads still carry a fan-sentiment signal.
        observations.push({ sourceId, text: post.title });
      }
    }
  } catch {
    // Network/parse failure -> empty bundle, never fabricated content.
  }

  return { sources, observations };
}

export async function fetchRssArticles(
  teams: string[],
  fetchImpl: FetchImpl,
  feeds: string[] = RSS_FEEDS
): Promise<{ sources: BundleSource[]; observations: Observation[] }> {
  const sources: BundleSource[] = [];
  const observations: Observation[] = [];
  const searchTerms = teams.map((t) => t.toLowerCase());

  for (const feedUrl of feeds) {
    try {
      const res = await fetchImpl(feedUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      for (const item of parseRssItems(xml)) {
        const haystack = `${item.title} ${item.description}`.toLowerCase();
        if (searchTerms.length > 0 && !searchTerms.some((t) => haystack.includes(t))) {
          continue;
        }
        const sourceId = `rss_article_${hashString(item.link || item.title)}`;
        sources.push({ id: sourceId, kind: "rss_article", url: item.link, title: item.title });
        observations.push({ sourceId, text: `${item.title}: ${item.description}`.slice(0, 300) });
      }
    } catch {
      // Skip this feed, keep going with the rest.
    }
  }

  return { sources, observations };
}

/** Minimal RSS <item> extractor — no XML dependency, just enough for BBC/ESPN's feed shape. */
function parseRssItems(xml: string): { title: string; link: string; description: string }[] {
  const items: { title: string; link: string; description: string }[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      description: extractTag(block, "description"),
    });
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

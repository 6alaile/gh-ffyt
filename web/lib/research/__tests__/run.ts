/**
 * Smoke tests for the research bundle fetchers, run via `npx tsx` (no
 * test framework added — matches the project's current zero-framework
 * TS footprint). Each fetcher is given a mocked `fetch` matching the
 * real API's documented response shape, since the sandbox that wrote
 * this can't reach reddit.com/fbref.com/wikipedia.org directly.
 *
 * Run: npx tsx lib/research/__tests__/run.ts
 */
import assert from "node:assert/strict";
import { fetchRedditThreads, fetchRssArticles } from "../reddit-bundle";
import { fetchFbrefStats, fetchWikipediaSummary } from "../fbref-bundle";
import { fetchTransfermarktProfile, searchTransfermarktProfileUrl } from "../transfermarkt";
import { buildRedditBundle, buildFbrefBundle } from "../bundles";
import { bundleSnapshotId, validateClaims, EvidenceError } from "../../evidence";

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => {
      passed++;
      console.log(`  ok  ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL  ${name}\n      ${err.message}`);
      process.exitCode = 1;
    });
}

function mockFetch(response: { ok: boolean; json?: () => any; text?: () => any }): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

async function main() {
  await check("fetchRedditThreads parses real search.json shape", async () => {
    const fakeFetch = mockFetch({
      ok: true,
      json: async () => ({
        data: {
          children: [
            {
              data: {
                id: "abc123",
                title: "Post Match Thread: Liverpool 2-1 Man City",
                permalink: "/r/soccer/comments/abc123/post_match/",
                selftext: "A dramatic finish at Anfield with a late winner.",
              },
            },
          ],
        },
      }),
    });
    const { sources, observations } = await fetchRedditThreads(["Liverpool", "Man City"], fakeFetch);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].id, "reddit_thread_abc123");
    assert.equal(sources[0].kind, "reddit_thread");
    assert.equal(observations[0].sourceId, "reddit_thread_abc123");
    assert.match(observations[0].text, /Anfield/);
  });

  await check("fetchRedditThreads degrades to empty on fetch failure (no fabrication)", async () => {
    const fakeFetch: typeof fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const { sources, observations } = await fetchRedditThreads(["Liverpool"], fakeFetch);
    assert.deepEqual(sources, []);
    assert.deepEqual(observations, []);
  });

  await check("fetchRssArticles filters by team and parses CDATA", async () => {
    const rssXml = `<rss><channel>
      <item>
        <title><![CDATA[Liverpool secure dramatic win]]></title>
        <link>https://bbc.co.uk/sport/1</link>
        <description><![CDATA[A last-minute goal sealed it.]]></description>
      </item>
      <item>
        <title>Tennis roundup</title>
        <link>https://bbc.co.uk/sport/2</link>
        <description>Unrelated tennis news.</description>
      </item>
    </channel></rss>`;
    const fakeFetch = mockFetch({ ok: true, text: async () => rssXml });
    const { sources, observations } = await fetchRssArticles(["Liverpool"], fakeFetch, ["https://feed.example/rss"]);
    assert.equal(sources.length, 1, "should only keep the Liverpool article, not the tennis one");
    assert.match(sources[0].title, /Liverpool/);
    assert.match(observations[0].text, /last-minute goal/);
  });

  await check("fetchWikipediaSummary parses REST summary shape", async () => {
    const fakeFetch = mockFetch({
      ok: true,
      json: async () => ({
        title: "Mohamed Salah",
        extract: "Mohamed Salah Hamed Mahrous Ghaly is an Egyptian professional footballer.",
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Mohamed_Salah" } },
      }),
    });
    const { sources, observations } = await fetchWikipediaSummary("Mohamed Salah", fakeFetch);
    assert.equal(sources[0].kind, "wikipedia_extract");
    assert.equal(sources[0].url, "https://en.wikipedia.org/wiki/Mohamed_Salah");
    assert.match(observations[0].text, /Egyptian professional footballer/);
  });

  await check("fetchFbrefStats extracts the last (season-total) data-stat row", async () => {
    const html = `
      <table>
        <tr><td data-stat="goals">1</td></tr>
        <tr><td data-stat="goals">2</td></tr>
        <tr><td data-stat="goals">18</td></tr>
      </table>`;
    const fakeFetch = mockFetch({ ok: true, text: async () => html });
    const { sources, observations } = await fetchFbrefStats("https://fbref.com/player/x", fakeFetch);
    assert.equal(sources[0].kind, "fbref_stat");
    assert.match(observations[0].text, /goals: 18/);
  });

  await check("fetchFbrefStats returns empty (not fabricated) when no data-stat cells present", async () => {
    const fakeFetch = mockFetch({ ok: true, text: async () => "<html><body>no table</body></html>" });
    const { sources, observations } = await fetchFbrefStats("https://fbref.com/player/y", fakeFetch);
    assert.deepEqual(sources, []);
    assert.deepEqual(observations, []);
  });

  await check("buildRedditBundle snapshot_id changes when sources change", async () => {
    let call = 0;
    const fakeFetch: typeof fetch = (async (url: any) => {
      call++;
      if (String(url).includes("reddit.com")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              children:
                call === 1
                  ? [{ data: { id: "p1", title: "Match Thread", permalink: "/r/x/1", selftext: "" } }]
                  : [
                      { data: { id: "p1", title: "Match Thread", permalink: "/r/x/1", selftext: "" } },
                      { data: { id: "p2", title: "Post Match Thread", permalink: "/r/x/2", selftext: "" } },
                    ],
            },
          }),
        };
      }
      return { ok: true, text: async () => "<rss><channel></channel></rss>" };
    }) as unknown as typeof fetch;

    const first = await buildRedditBundle(["Liverpool"], fakeFetch);
    const second = await buildRedditBundle(["Liverpool"], fakeFetch);
    assert.notEqual(first.snapshotId, second.snapshotId, "second fetch found an extra thread, snapshot must differ");
  });

  await check("buildFbrefBundle produces claims that pass validateClaims when grounded", async () => {
    const fakeFetch = mockFetch({
      ok: true,
      json: async () => ({
        title: "Erling Haaland",
        extract: "Erling Braut Haaland is a Norwegian professional footballer.",
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Erling_Haaland" } },
      }),
    });
    const bundle = await buildFbrefBundle(["Erling Haaland"], [], fakeFetch);
    assert.equal(bundle.sources.length, 1);

    const claim = {
      id: "claim_1",
      text: bundle.observations[0].text,
      evidence_class: "observed" as const,
      source_ids: [bundle.sources[0].id],
      snapshot_id: bundle.snapshotId,
    };
    // Should not throw.
    validateClaims([claim], bundle.sources.map((s) => s.id), bundle.snapshotId);
  });

  await check("a claim citing a source outside the bundle is rejected", () => {
    const snapshotId = bundleSnapshotId("fbref", ["wikipedia_extract_x"], "2026-09-01T00:00:00Z");
    const claim = {
      id: "claim_bad",
      text: "Fabricated detail not in any fetched source.",
      evidence_class: "observed" as const,
      source_ids: ["wikipedia_extract_never_fetched"],
      snapshot_id: snapshotId,
    };
    assert.throws(
      () => validateClaims([claim], ["wikipedia_extract_x"], snapshotId),
      EvidenceError
    );
  });

  await check("fetchTransfermarktProfile extracts fields via ported felipeall selectors", async () => {
    const html = `
      <meta name="description" content="Erling Haaland, 25, from Norway Manchester City, since 2022 Centre-Forward Market value: €180.00m">
      <span class="data-header__club">Playing for <a href="/manchester-city/startseite/verein/281">Manchester City</a></span>
      <a class="data-header__market-value-wrapper" href="/x"> €180.00m <span class="data-header__last-update">(as of Jan 1, 2026)</span></a>
      <span class="data-header__shirt-number">#9</span>
      <dt>Main position:</dt><dd class="detail-position__position">Centre-Forward</dd>
      <span itemprop="birthDate">Jul 21, 2000 (25)</span>
    `;
    const fakeFetch = mockFetch({ ok: true, text: async () => html });
    const { sources, observations } = await fetchTransfermarktProfile(
      "https://www.transfermarkt.com/erling-haaland/profil/spieler/418560",
      fakeFetch
    );
    assert.equal(sources[0].kind, "transfermarkt_profile");
    const combined = observations.map((o) => o.text).join(" | ");
    assert.match(combined, /Manchester City/);
    assert.match(combined, /€180\.00m/);
    assert.match(combined, /#9/);
  });

  await check("fetchTransfermarktProfile returns empty (not fabricated) when page shape is unrecognized", async () => {
    const fakeFetch = mockFetch({ ok: true, text: async () => "<html><body>nothing recognizable</body></html>" });
    const { sources, observations } = await fetchTransfermarktProfile("https://www.transfermarkt.com/x", fakeFetch);
    assert.deepEqual(sources, []);
    assert.deepEqual(observations, []);
  });

  await check("searchTransfermarktProfileUrl resolves the first player profile link", async () => {
    const html = `<div class="box"><h2>players</h2><table><tr class="odd">
      <td class="hauptlink"><a href="https://www.transfermarkt.com/erling-haaland/profil/spieler/418560">Erling Haaland</a></td>
    </tr></table></div>`;
    const fakeFetch = mockFetch({ ok: true, text: async () => html });
    const url = await searchTransfermarktProfileUrl("Erling Haaland", fakeFetch);
    assert.equal(url, "https://www.transfermarkt.com/erling-haaland/profil/spieler/418560");
  });

  await check("searchTransfermarktProfileUrl returns null (not a guess) when nothing found", async () => {
    const fakeFetch = mockFetch({ ok: true, text: async () => "<html>no results</html>" });
    const url = await searchTransfermarktProfileUrl("Nobody FC", fakeFetch);
    assert.equal(url, null);
  });

  await check("buildFbrefBundle wires the Transfermarkt search->profile chain end to end", async () => {
    const searchHtml = `<a href="https://www.transfermarkt.com/erling-haaland/profil/spieler/418560">Erling Haaland</a>`;
    const profileHtml = `<meta name="description" content="Erling Haaland profile">
      <span class="data-header__shirt-number">#9</span>`;
    const fakeFetch: typeof fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("schnellsuche")) return { ok: true, text: async () => searchHtml };
      if (u.includes("transfermarkt.com/erling-haaland")) return { ok: true, text: async () => profileHtml };
      return { ok: false };
    }) as unknown as typeof fetch;

    const bundle = await buildFbrefBundle([], [], fakeFetch, ["Erling Haaland"], []);
    assert.equal(bundle.sources.length, 1);
    assert.equal(bundle.sources[0].kind, "transfermarkt_profile");
    validateClaims(
      [
        {
          id: "c1",
          text: bundle.observations[0].text,
          evidence_class: "observed",
          source_ids: [bundle.sources[0].id],
          snapshot_id: bundle.snapshotId,
        },
      ],
      bundle.sources.map((s) => s.id),
      bundle.snapshotId
    );
  });

  console.log(`\n${passed} passed`);
}

main();

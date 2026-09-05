import type { ResearchBundle } from "./research/types";

/**
 * Fallback brief builder — fires when no LLM key is configured or LLM
 * enrichment failed/returned an unusable shape.
 *
 * Previously this filled scene fields with plausible-looking invented
 * numbers (e.g. a hardcoded "Counter num: 15" presented as a real match
 * stat). It no longer does that: every field that would need a specific
 * factual claim either (a) comes from real user-entered form input,
 * (b) comes from a quoted excerpt of a real fetched source in
 * `researchBundle`, tagged with which source it came from, or (c) is an
 * explicit "NEEDS VERIFICATION" marker when no grounded source exists —
 * never a specific invented figure standing in as fact.
 */
export function buildMarkdownBrief({
  briefId,
  mode,
  formData,
  transcript,
  enrichedContent,
  researchBundle,
}: {
  briefId: string;
  mode: string;
  formData: any;
  transcript?: string;
  enrichedContent?: string;
  researchBundle?: ResearchBundle;
}): string {
  if (enrichedContent && enrichedContent.includes("## Hook") && enrichedContent.includes("## Scene")) {
    return enrichedContent;
  }

  const title = formData.matchTitle || transcript?.slice(0, 40) || "Match Breakdown";
  const teams = formData.teams || "Team A vs Team B";
  const moments = formData.keyMoments || transcript || "Key tactical moments.";
  const angle = formData.analysisAngle || "defensive-collapse";
  const tone = formData.tone || "analytical";
  const cta = formData.cta || "Which team should we break down next? Subscribe for more tactical analysis!";

  const teamList = teams.split(",").map((t: string) => t.trim());
  const teamA = teamList[0] || "Home Team";
  const teamB = teamList[1] || "Away Team";
  const formattedAngle = angle.toUpperCase().replace(/-/g, " ");

  const sources = researchBundle?.sources ?? [];
  const observations = researchBundle?.observations ?? [];
  const topObservation = observations[0]?.text?.replace(/\n/g, " ").slice(0, 140);
  const secondObservation = observations[1]?.text?.replace(/\n/g, " ").slice(0, 140);

  const scene1Voiceover = topObservation
    ? `"${topObservation}"`
    : `"${moments.slice(0, 120).replace(/\n/g, " ")}"`;
  const scene2Body = secondObservation
    ? `Reported context: "${secondObservation}" — verify tactical specifics against FBref before finalizing the script.`
    : "TODO: NEEDS VERIFICATION — no grounded source found for a tactical claim here. Pull FBref/Transfermarkt stats before writing this scene's voiceover.";

  return `# 🎬 Content Brief: ${title}

> **Brief ID:** ${briefId}
> **Mode:** ${mode} | **Tone:** ${tone}

## The Idea
**Core concept:** ${angle} — tactical breakdown of ${teams}.
**Unique angle:** ${title}. Focusing on key momentum swings and structural failures.
**Why now:** Trending match discussion following recent performance.

## Hook
**Kind:** hook
**Duration:** 8s
**Query:** football stadium crowd floodlights
**Top label:** LIVE BREAKDOWN
**Bottom label:** ${teams.toUpperCase()}
**Pill:** TACTICAL
**Eyebrow:** // MATCH ANALYSIS
**Headline:** THE <accent>${formattedAngle}</accent>
**Subhead:** // HOW THE MATCH WAS LOST IN 90 MINUTES
**Voiceover:** "${title}. When the final whistle blew, nobody expected this tactical collapse."

## Scene 1 — The Turning Point
**Kind:** record
**Duration:** 10s
**Query:** stopwatch timer referee whistle
**Top label:** 01 — TURNING POINT
**Bottom label:** STATISTICAL IMPACT
**Pill:** LIVE
**Eyebrow:** // THE SHIFT
**Name:** ${sources.length > 0 ? "SOURCE SIGNAL" : "NEEDS VERIFICATION"}
**Counter label:** SOURCES REFERENCED
**Counter num:** ${sources.length}
**Counter suffix:** ${sources.length > 0 ? "fan/media sources found this week" : "no sources found — verify manually"}
**Voiceover:** ${scene1Voiceover}

## Scene 2 — Tactical Breakdown
**Kind:** split
**Variant:** side-by-side
**Duration:** 14s
**Query:** football tactics board diagram
**Top label:** 02 — TACTICAL ANALYSIS
**Bottom label:** NEEDS VERIFICATION
**Eyebrow:** // SYSTEM FAILURE
**Headline:** TACTICAL <accent>READ</accent>
**Body:** ${scene2Body}
**Image query:** football tactics heatmap
**Voiceover:** "TODO: NEEDS VERIFICATION — write this voiceover from a confirmed FBref/Transfermarkt stat, not from an assumption."

## Scene 3 — Key Performers
**Kind:** grid
**Duration:** 12s
**Query:** football celebration team
**Top label:** 03 — KEY PERFORMERS
**Bottom label:** MATCH IMPACT
**Headline:** MATCH <accent>FACTORS</accent>
**Cards:**
- ⚽ | ${teamA.toUpperCase()} | Key Tactics | "TODO: NEEDS VERIFICATION"
- 🛡️ | ${teamB.toUpperCase()} | Defensive Line | "TODO: NEEDS VERIFICATION"
- 🎯 | MATCH VERDICT | Key Moment | "${angle.replace(/-/g, " ")}"
**Voiceover:** "TODO: NEEDS VERIFICATION — confirm standout performers via FBref before writing this voiceover."

## Scene 4 — Takeaways
**Kind:** list
**Duration:** 12s
**Query:** football stadium tunnel entrance
**Top label:** 04 — VERDICT
**Bottom label:** LESSONS
**Eyebrow:** // KEY FACTORS
**Headline:** THREE <accent>LESSONS</accent>
**Items:**
- TODO: NEEDS VERIFICATION — first takeaway, ground it in a real stat or quote
- TODO: NEEDS VERIFICATION — second takeaway
- TODO: NEEDS VERIFICATION — third takeaway
**Voiceover:** "TODO: NEEDS VERIFICATION — three takeaways, each grounded in a checked source."

## Scene 5 — Outro & CTA
**Kind:** quote
**Duration:** 8s
**Query:** football fans cheering stadium
**Top label:** 05 — COMMUNITY
**Bottom label:** JOIN THE DISCUSSION
**Eyebrow:** // YOUR TURN
**Quote:** "Who was most to blame for this outcome?"
**Attribution:** LEAVE A COMMENT BELOW
**Sub:** ${cta}
**Voiceover:** "${cta}"

## YouTube Metadata
**Title options:**
1. ${title}: Tactical Breakdown
2. ${teams}: The Tactical Collapse Explained
3. Why ${teams} Lost Control of the Match

**Description:**
Deep dive tactical analysis into ${teams}.
Analyzing key moments: ${moments.slice(0, 150)}.

Subscribe for more tactical football breakdowns!

**Tags:** ${teamList.join(", ")}, football analysis, tactical breakdown, soccer stats

**Category:** Sports

## Research Sources
${
  sources.length > 0
    ? sources.map((s) => `- [${s.kind}] ${s.title} — ${s.url}`).join("\n")
    : "No sources were fetched — every NEEDS VERIFICATION marker above must be resolved manually before this brief is used."
}

**Snapshot ID:** ${researchBundle?.snapshotId ?? "none"}
`;
}

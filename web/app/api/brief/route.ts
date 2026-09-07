import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildRedditBundle } from "../../../lib/research/bundles";
import { buildMarkdownBrief } from "../../../lib/brief-builder";
import { getLLMProvider } from "../../../lib/llm/provider";
import { generateValidated } from "../../../lib/llm/generate";
import type { LLMProvider } from "../../../lib/llm/types";
import type { ResearchBundle } from "../../../lib/research/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BriefRequest = {
  mode: "quick" | "research" | "topic-only";
  formData: {
    matchTitle?: string;
    teams?: string;
    keyMoments?: string;
    analysisAngle?: string;
    tone?: string;
    cta?: string;
    aspectRatio?: "16:9" | "9:16";
  };
  transcript?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: BriefRequest = await req.json();
    const { mode, formData, transcript } = body;

    const briefId = crypto.randomBytes(4).toString("hex");

    let enrichedContent = "";
    const llmProvider = getLLMProvider();

    if (llmProvider && (mode === "research" || mode === "topic-only")) {
      try {
        enrichedContent = await callLLMEnrichment({
          provider: llmProvider,
          mode,
          formData,
          transcript,
        });
      } catch (err) {
        console.warn("LLM enrichment failed after retry, falling back to grounded research:", err);
      }
    }

    // Only fetch real research when we're about to fall back — if the LLM
    // enrichment already produced a valid brief, we don't need it.
    let researchBundle: ResearchBundle | undefined;
    const needsFallback = !(
      enrichedContent && enrichedContent.includes("## Hook") && enrichedContent.includes("## Scene")
    );
    if (needsFallback) {
      const teams = (formData.teams || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      try {
        researchBundle = await buildRedditBundle(teams);
      } catch (err) {
        console.warn("Research bundle fetch failed, falling back with no grounded facts:", err);
      }
    }

    const briefMarkdown = buildMarkdownBrief({
      briefId,
      mode,
      formData,
      transcript,
      enrichedContent,
      researchBundle,
    });

    return NextResponse.json({
      briefId,
      markdown: briefMarkdown,
    });
  } catch (error: any) {
    console.error("Brief generation error:", error);
    return NextResponse.json(
      { error: error?.message || "Brief generation failed" },
      { status: 500 }
    );
  }
}

async function callLLMEnrichment({
  provider,
  mode,
  formData,
  transcript,
}: {
  provider: LLMProvider;
  mode: string;
  formData: any;
  transcript?: string;
}): Promise<string> {
  const systemPrompt = `You are an elite YouTube football tactical analyst and video script writer for MD2YT.
Your job is to generate a production-ready Markdown video content brief for a fast-paced 60-120 second YouTube video.

The Markdown brief MUST follow this EXACT structure with proper markdown headers and bold field labels:

# 🎬 Content Brief: [Title]

## The Idea
**Core concept:** [1 sentence concept]
**Unique angle:** [Tactical perspective]
**Why now:** [Current context]

## Hook
**Kind:** hook
**Duration:** 8s
**Query:** football stadium crowd floodlights
**Top label:** LIVE ANALYZER
**Bottom label:** [MATCH TITLE]
**Pill:** TACTICAL
**Eyebrow:** // MATCH BREAKDOWN
**Headline:** [PUNCHY 2-4 WORD HEADLINE WITH <accent>KEY WORD</accent>]
**Subhead:** // [ONE LINE SUBHEAD]
**Voiceover:** [8-second opening hook voiceover sentence landing the core premise]

## Scene 1 — The Turning Point
**Kind:** record
**Duration:** 10s
**Query:** football stopwatch timer
**Top label:** 01 — THE COUNT
**Bottom label:** IMPACT STAT
**Pill:** LIVE
**Eyebrow:** // KEY NUMBERS
**Name:** [KEY METRIC OR MOMENT]
**Counter label:** [STAT LABEL]
**Counter num:** [NUMBER]
**Counter suffix:** [CONTEXT SUFFIX]
**Voiceover:** [10-second voiceover explaining the stat and its significance]

## Scene 2 — Tactical Breakdown
**Kind:** split
**Variant:** side-by-side
**Duration:** 14s
**Query:** football tactics board motion
**Top label:** 02 — BREAKDOWN
**Bottom label:** STRUCTURAL FAILURE
**Eyebrow:** // TACTICAL SHIFT
**Headline:** [TACTICAL HEADLINE WITH <accent>ACCENT</accent>]
**Body:** [2-sentence explanation of what failed tactically]
**Image query:** football tactical formation graphic
**Voiceover:** [14-second voiceover detailing the tactical shift or defensive failure]

## Scene 3 — Key Performers
**Kind:** grid
**Duration:** 14s
**Query:** football player action shot
**Top label:** 03 — LINEUP
**Bottom label:** KEY IMPACT
**Headline:** KEY <accent>PERFORMERS</accent>
**Cards:**
- ⚽ | ATTACK | [Player/Unit 1] | "[Key Stat or Quote 1]"
- 🛡️ | DEFENSE | [Player/Unit 2] | "[Key Stat or Quote 2]"
- 🎯 | MIDFIELD | [Player/Unit 3] | "[Key Stat or Quote 3]"
**Voiceover:** [14-second voiceover highlighting key individual performances]

## Scene 4 — Takeaways
**Kind:** list
**Duration:** 12s
**Query:** football stadium tunnel
**Top label:** 04 — VERDICT
**Bottom label:** LESSONS
**Eyebrow:** // KEY FACTORS
**Headline:** THREE <accent>LESSONS</accent>
**Items:**
- [Takeaway 1]
- [Takeaway 2]
- [Takeaway 3]
**Voiceover:** [12-second voiceover walking through the three key takeaways]

## Scene 5 — Outro & CTA
**Kind:** quote
**Duration:** 10s
**Query:** football fans cheering stadium
**Top label:** 05 — COMMUNITY
**Bottom label:** JOIN DISCUSSION
**Eyebrow:** // YOUR TURN
**Quote:** "[Engaging question for comments]"
**Attribution:** LEAVE A COMMENT BELOW
**Sub:** Subscribe for weekly tactical breakdowns
**Voiceover:** [10-second voiceover asking the audience for their thoughts and giving CTA]

## Format & Length
**Aspect ratio:** [16:9 or 9:16 — use exactly the value given in the request, verbatim]

## YouTube Metadata
**Title options:**
1. [Catchy Title 1]
2. [Tactical Title 2]
3. [Question Title 3]

**Description:**
[2-3 paragraph YouTube video description with chapter breakdown]

**Tags:** football, tactical breakdown, soccer, match analysis, [team1], [team2]

**Category:** Sports

Strictly output ONLY valid Markdown text following this structure. Do NOT wrap output in triple backtick markdown blocks.`;

  const userPrompt = `Generate a complete MD2YT brief for:
Match/Topic: ${formData.matchTitle || formData.teams || "Match Breakdown"}
Teams: ${formData.teams || "Team A vs Team B"}
Key Moments/Observations: ${formData.keyMoments || transcript || "Detailed tactical breakdown"}
Analysis Angle: ${formData.analysisAngle || "defensive-collapse"}
Tone: ${formData.tone || "analytical"}
CTA: ${formData.cta || "Subscribe for more tactical breakdowns!"}
Aspect ratio: ${formData.aspectRatio || "16:9"}`;

  const response = await generateValidated(
    provider,
    userPrompt,
    (raw) => {
      const content = raw.replace(/^```markdown\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();
      if (!content.includes("## Hook") || !content.includes("## Scene")) {
        throw new Error("Response is missing required '## Hook' and '## Scene' sections");
      }
      return content;
    },
    { system: systemPrompt }
  );
  return response;
}


import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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
  };
  transcript?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: BriefRequest = await req.json();
    const { mode, formData, transcript } = body;

    const briefId = crypto.randomBytes(4).toString("hex");

    let enrichedContent = "";
    const apiKey =
      process.env.OMNIROUTE_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (apiKey && (mode === "research" || mode === "topic-only")) {
      try {
        enrichedContent = await callLLMEnrichment({
          apiKey,
          mode,
          formData,
          transcript,
        });
      } catch (err) {
        console.warn("LLM enrichment failed, falling back to rule-based:", err);
      }
    }

    const briefMarkdown = buildMarkdownBrief({
      briefId,
      mode,
      formData,
      transcript,
      enrichedContent,
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
  apiKey,
  mode,
  formData,
  transcript,
}: {
  apiKey: string;
  mode: string;
  formData: any;
  transcript?: string;
}): Promise<string> {
  const isOmni = process.env.OMNIROUTE_API_KEY || process.env.OPENROUTER_API_KEY;
  const url = isOmni
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

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
CTA: ${formData.cta || "Subscribe for more tactical breakdowns!"}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: isOmni ? "google/gemini-2.0-flash-001" : "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/^```markdown\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  return content.trim();
}

function buildMarkdownBrief({
  briefId,
  mode,
  formData,
  transcript,
  enrichedContent,
}: {
  briefId: string;
  mode: string;
  formData: any;
  transcript?: string;
  enrichedContent?: string;
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
**Name:** DEFENSIVE BREAKDOWN
**Counter label:** MINUTES TO CONCEDE
**Counter num:** 15
**Counter suffix:** CRITICAL POSSESSION LOSSES
**Voiceover:** "${moments.slice(0, 120).replace(/\n/g, " ")}"

## Scene 2 — Tactical Breakdown
**Kind:** split
**Variant:** side-by-side
**Duration:** 14s
**Query:** football tactics board diagram
**Top label:** 02 — TACTICAL ANALYSIS
**Bottom label:** HIGH LINE EXPOSED
**Eyebrow:** // SYSTEM FAILURE
**Headline:** MIDFIELD <accent>GAPS</accent>
**Body:** Defensive shape fractured under pressure, allowing central penetration.
**Image query:** football tactics heatmap
**Voiceover:** "Notice how midfield tracking completely dissolved during transitions. Without central protection, defensive lines were overwhelmed."

## Scene 3 — Key Performers
**Kind:** grid
**Duration:** 12s
**Query:** football celebration team
**Top label:** 03 — KEY PERFORMERS
**Bottom label:** MATCH IMPACT
**Headline:** MATCH <accent>FACTORS</accent>
**Cards:**
- 🇦🇱 | ${teamA.toUpperCase()} | Key Tactics | "High Pressing System"
- 🇧🇷 | ${teamB.toUpperCase()} | Defensive Line | "Structure Under Pressure"
- 🇨🇦 | MATCH VERDICT | Key Moment | "${angle.replace(/-/g, " ")}"
**Voiceover:** "Key individual battles determined the outcome across all three zones of the pitch."

## Scene 4 — Takeaways
**Kind:** list
**Duration:** 12s
**Query:** football stadium tunnel entrance
**Top label:** 04 — VERDICT
**Bottom label:** LESSONS
**Eyebrow:** // KEY FACTORS
**Headline:** THREE <accent>LESSONS</accent>
**Items:**
- Transitional speed failed under high intensity
- Spatial awareness in defensive third was lacking
- Tactical adjustments arrived too late in the half
**Voiceover:** "Three crucial lessons stand out from this performance. Fix these structural errors or expect repeat results."

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
`;
}

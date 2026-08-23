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

  const prompt = `You are a YouTube football tactical analyst. 
Synthesize a short, punchy tactical breakdown for a video brief based on these details:
Match/Topic: ${formData.matchTitle || formData.teams || "Match Breakdown"}
Teams: ${formData.teams || "N/A"}
Key Moments: ${formData.keyMoments || transcript || "N/A"}
Angle: ${formData.analysisAngle || "defensive-collapse"}
Tone: ${formData.tone || "analytical"}

Provide:
1. A 1-sentence hook line for the video.
2. 3 key tactical points explaining what went wrong or right.
3. Suggested scene titles and voiceover lines for a 2-minute video.`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: isOmni ? "google/gemini-2.0-flash-001" : "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API returned ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
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
  const title =
    formData.matchTitle || transcript?.slice(0, 40) || "Match Breakdown";
  const teams = formData.teams || "Team A vs Team B";
  const moments =
    formData.keyMoments || transcript || "Key moments to be highlighted.";
  const angle = formData.analysisAngle || "defensive-collapse";
  const tone = formData.tone || "analytical";
  const cta =
    formData.cta ||
    "Which team should we break down next? Subscribe for more tactical analysis!";

  const llmSection = enrichedContent
    ? `\n\n### AI Tactical Synthesis:\n${enrichedContent}\n`
    : "";

  return `# 🎬 Content Brief: ${title}

> **Brief ID:** ${briefId}
> **Mode:** ${mode} | **Tone:** ${tone}

## The Idea
**Core concept:** ${angle} — tactical breakdown of ${teams}.
**Unique angle:** ${title}. Focusing on key momentum swings and structural failures.
**Why now:** Trending discussion around ${teams}.${llmSection}

---

## Audience
**Primary viewer:** Football fan looking for clear, rapid tactical breakdown.
**What they should feel after watching:** Informed, amazed by tactical nuances, engaged to comment.

---

## Hook (First 0–8 seconds)

**Hook line:** "${title}: Here's what nobody is talking about."
**Opening visual:** Fast-cut montage: stadium aerial shot → key moment graphics → tactical breakdown freeze frame.

---

## Script Outline

| # | Scene Title | Duration | Voiceover / On-screen Text | Visual Direction | Notes |
|---|-------------|----------|---------------------------|-----------------|-------|
| 1 | Hook | 0–8s | "${title}. Let's break down exactly what happened." | Fast montage: stadium, crowd, key match moments | Hard cut to black after hook |
| 2 | The Turning Point | 8–45s | "${moments.replace(/\n/g, " ")}" | Animated tactical diagram showing positioning | Highlight key errors & movements |
| 3 | Tactical Shift | 45s–1:30 | "Notice the spacing in midfield during this phase. ${angle} left massive gaps." | Split screen stats & player heatmaps | Data breakdown |
| 4 | Verdict & CTA | 1:30–2:00 | "${cta}" | Channel branding and subscribe button animation | Clean outro card |

---

## YouTube Metadata

**Title options:**
1. ${title}
2. ${teams}: The Tactical Collapse Explained
3. Why ${teams} Lost Control of the Match

**Description:**
Deep dive into ${teams}. Analyzing ${moments.slice(0, 150)}.
Sub for more tactical football breakdowns!

**Tags:** ${teams
    .split(",")
    .map((t: string) => t.trim())
    .join(", ")}, football analysis, tactical breakdown, soccer stats

---

**Generated:** ${new Date().toISOString()}
`;
}

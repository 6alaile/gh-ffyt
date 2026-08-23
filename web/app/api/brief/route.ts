import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

type BriefRequest = {
  mode: "quick" | "research" | "topic-only";
  formData: {
    matchTitle?: string;
    teams?: string;
    keyMoments?: string;
    analysisAngle: string;
    tone: string;
    cta?: string;
  };
  transcript?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: BriefRequest = await req.json();
    const { mode, formData, transcript } = body;

    const briefId = crypto.randomBytes(4).toString("hex");
    const briefDir = path.join(process.cwd(), "..", "briefs");
    await mkdir(briefDir, { recursive: true });

    let briefMarkdown: string;

    if (mode === "quick") {
      briefMarkdown = await generateQuickBrief(formData, transcript);
    } else if (mode === "research") {
      briefMarkdown = await generateResearchBrief(formData, transcript);
    } else {
      briefMarkdown = await generateTopicOnlyBrief(formData.matchTitle || "");
    }

    const briefPath = path.join(briefDir, `brief-${briefId}.md`);
    await writeFile(briefPath, briefMarkdown, "utf-8");

    return NextResponse.json({
      briefId,
      briefPath: `briefs/brief-${briefId}.md`,
      markdown: briefMarkdown,
    });
  } catch (error) {
    console.error("Brief generation error:", error);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}

function generateQuickBrief(formData: any, transcript?: string): Promise<string> {
  const title = formData.matchTitle || "Untitled Match Analysis";
  const teams = formData.teams || "TBD";
  const keyMoments = formData.keyMoments || transcript || "No key moments provided";
  const angle = formData.analysisAngle || "general";
  const tone = formData.tone || "analytical";
  const cta = formData.cta || "Subscribe for more analysis";

  const brief = `# Content Brief: ${title}

## The Idea
**Core concept:** ${angle}
**Match:** ${teams}
**Tone:** ${tone}

---

## Key Moments
${keyMoments}

---

## Script Outline

| # | Scene Title | Duration | Voiceover / On-screen Text | Visual Direction | Notes |
|---|-------------|----------|---------------------------|-----------------|-------|
| 1 | Hook | 0-8s | TODO: Add hook script | Match highlights | Opening scene |
| 2 | Analysis | 8-60s | TODO: Add analysis | Tactical graphics | Main content |
| 3 | CTA | 60-75s | ${cta} | Channel logo | Closing |

---

## YouTube Metadata

**Title options:**
1. ${title}
2. TODO: Add alternative title

**Description:** TODO: Add description

**Tags:** ${teams}, football, soccer, match analysis

---

**Generated:** ${new Date().toISOString()}
**Mode:** Quick Brief (no research)
`;

  return Promise.resolve(brief);
}

function generateResearchBrief(formData: any, transcript?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const topic = formData.matchTitle || formData.teams || transcript || "";
    
    const pythonScript = `
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))

from pipeline.research import research_topic, synthesize_brief

form_data = json.loads(sys.argv[1])
topic = sys.argv[2]

findings = research_topic(topic, mode="enrich")
brief_md = synthesize_brief(form_data, findings, mode="enrich")
print(brief_md)
`;

    const formDataJson = JSON.stringify(formData);
    const python = spawn("python", ["-c", pythonScript, formDataJson, topic]);

    let output = "";
    let errorOutput = "";

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    python.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        console.error("Python research failed:", errorOutput);
        // Fallback to quick brief if research fails
        resolve(generateQuickBrief(formData, transcript).then(r => r));
      }
    });
  });
}

function generateTopicOnlyBrief(topic: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonScript = `
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))

from pipeline.research import research_topic, synthesize_brief

topic = sys.argv[1]

findings = research_topic(topic, mode="full")
form_data = {
    "matchTitle": topic,
    "analysisAngle": "Topic research",
    "tone": "analytical",
    "cta": "Subscribe for more"
}
brief_md = synthesize_brief(form_data, findings, mode="full")
print(brief_md)
`;

    const python = spawn("python", ["-c", pythonScript, topic]);

    let output = "";
    let errorOutput = "";

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    python.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        console.error("Python topic research failed:", errorOutput);
        reject(new Error("Topic-only research failed"));
      }
    });
  });
}

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { briefPath, briefId } = await req.json();

    if (!briefPath || !briefId) {
      return NextResponse.json({ error: "Missing briefPath or briefId" }, { status: 400 });
    }

    const specPath = await generateSpecFromBrief(briefPath, briefId);

    if (!specPath) {
      return NextResponse.json({ error: "Spec generation failed" }, { status: 500 });
    }

    return NextResponse.json({
      specId: briefId,
      specPath,
    });
  } catch (error) {
    console.error("Spec generation error:", error);
    return NextResponse.json({ error: "Spec generation failed" }, { status: 500 });
  }
}

function generateSpecFromBrief(briefPath: string, briefId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const pythonScript = `
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))

from pipeline.brief import parse_brief
from pipeline.schema import validate_spec

brief_path = Path(sys.argv[1])
brief_text = brief_path.read_text(encoding="utf-8")

spec = parse_brief(brief_text)
spec["id"] = sys.argv[2]

spec_dir = Path("specs/_uploads")
spec_dir.mkdir(parents=True, exist_ok=True)
spec_path = spec_dir / f"{sys.argv[2]}.json"

spec_path.write_text(json.dumps(spec, indent=2), encoding="utf-8")
print(str(spec_path))
`;

    const python = spawn("python", ["-c", pythonScript, briefPath, briefId]);

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
        console.error("Python spec generation failed:", errorOutput);
        resolve(null);
      }
    });
  });
}

import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import os from "os";

export const maxDuration = 180; // 3 minutes (Vercel Hobby plan limit)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const tmpDir = os.tmpdir();
    const audioPath = path.join(tmpDir, `voice-${Date.now()}.webm`);
    await writeFile(audioPath, buffer);

    const transcript = await transcribeWithPython(audioPath);

    if (!transcript) {
      return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

function transcribeWithPython(audioPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const pythonScript = `
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent.parent / "src"))
from pipeline.transcribe import transcribe_audio

audio_path = Path(sys.argv[1])
transcript = transcribe_audio(audio_path)
if transcript:
    print(transcript)
`;

    const python = spawn("python", ["-c", pythonScript, audioPath]);

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
        console.error("Python transcription failed:", errorOutput);
        resolve(null);
      }
    });
  });
}

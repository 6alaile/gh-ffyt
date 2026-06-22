import { NextRequest, NextResponse } from "next/server";
import { getRun, listArtifacts, repoEnv } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/status?run_id=123
 *
 * Returns the run's status + a list of its artifacts. When the run is
 * completed, we map known artifact names to human-friendly slots:
 *   - "spec.json"         → spec (the auto-filled spec the workflow committed)
 *   - "*-mp4"             → mp4   (the rendered video)
 *   - "render-log"        → log   (build log)
 *
 * The actual download is via /api/download?run_id=…&name=… which 302s
 * to GitHub's signed zip URL.
 */
export async function GET(req: NextRequest) {
  const runId = Number(req.nextUrl.searchParams.get("run_id") || "");
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  let env;
  try {
    env = repoEnv();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let run;
  try {
    run = await getRun({ token: env.token, repo: env.repo, runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  if (run.status !== "completed") {
    return NextResponse.json({
      status: run.status === "in_progress" ? "running" : "queued",
      conclusion: null,
      htmlUrl: run.html_url,
      artifacts: [],
    });
  }

  let arts;
  try {
    arts = await listArtifacts({ token: env.token, repo: env.repo, runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Heuristic: pick the latest spec.json + the latest *-mp4 + render-log.
  const spec = arts.find((a) => a.name === "spec.json") ?? null;
  const mp4 = arts.find((a) => a.name.endsWith("-mp4")) ?? null;
  const log = arts.find((a) => a.name === "render-log") ?? null;

  return NextResponse.json({
    status: run.conclusion === "success" ? "completed" : "failed",
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    artifactPaths: {
      spec: spec?.name ?? null,
      mp4: mp4?.name ?? null,
      log: log?.name ?? null,
    },
    artifacts: arts,
  });
}
import { NextRequest, NextResponse } from "next/server";
import { artifactDownloadUrl, listArtifacts, repoEnv } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/download?run_id=…&name=…
 *
 * Resolves the artifact by name within the run's artifact list, fetches
 * GitHub's signed zip URL, and 302s the browser to it.
 *
 * Artifacts are zip files, so the browser saves them with that name;
 * for the spec.json case that's tolerable (users unzip + read). For
 * the MP4 we accept the same — there's no way to stream a single file
 * out of an artifact zip from a serverless function without buffering.
 */
export async function GET(req: NextRequest) {
  const runId = Number(req.nextUrl.searchParams.get("run_id") || "");
  const name = req.nextUrl.searchParams.get("name") || "";
  if (!Number.isFinite(runId) || runId <= 0 || !name) {
    return NextResponse.json({ error: "run_id and name required" }, { status: 400 });
  }

  let env;
  try {
    env = repoEnv();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  let arts;
  try {
    arts = await listArtifacts({ token: env.token, repo: env.repo, runId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  const target = arts.find((a) => a.name === name);
  if (!target) {
    return NextResponse.json({ error: `no artifact named ${name}` }, { status: 404 });
  }

  let url;
  try {
    url = await artifactDownloadUrl({
      token: env.token,
      repo: env.repo,
      artifactId: target.id,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  return NextResponse.redirect(url, 302);
}
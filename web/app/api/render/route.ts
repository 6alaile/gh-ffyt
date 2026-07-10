import { NextRequest, NextResponse } from "next/server";
import { dispatchWorkflow, listRuns, repoEnv } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/render
 *   { "uploadId": "abc1234", "briefPath": "briefs/example-abc1234.md" }
 *
 * Dispatches render-and-upload.yml with upload_id + brief_path inputs.
 * GitHub returns 204 with no body on workflow_dispatch, so we don't get
 * the run id back. We then list the workflow's runs and take the newest
 * one created in the last minute as ours. (Fine for a single-user UI;
 * for multi-tenant, switch to a workflow that echoes the dispatch id
 * back via an artifact and have the status route resolve it.)
 */
export async function POST(req: NextRequest) {
  let body: { uploadId?: unknown; briefPath?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
  const briefPath = typeof body.briefPath === "string" ? body.briefPath : "";
  if (!uploadId || !briefPath) {
    return NextResponse.json({ error: "uploadId and briefPath required" }, { status: 400 });
  }

  let env;
  try {
    env = repoEnv();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const ref = process.env.GH_REF || "split";

  try {
    await dispatchWorkflow({
      token: env.token,
      repo: env.repo,
      workflow: env.workflow,
      ref,
      inputs: { upload_id: uploadId, brief_path: briefPath },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const run = await findRecentRun(env.token, env.repo, env.workflow, 6);
  if (!run) {
    return NextResponse.json({
      dispatchPending: true,
      actionsUrl: `https://github.com/${env.repo}/actions/workflows/${env.workflow}`,
    });
  }
  return NextResponse.json({ runId: run.id, actionsUrl: run.html_url });
}

async function findRecentRun(
  token: string,
  repo: string,
  workflow: string,
  attempts: number
): Promise<{ id: number; html_url: string } | null> {
  for (let i = 0; i < attempts; i++) {
    const runs = await listRuns({ token, repo, workflow });
    const fresh = runs.filter(
      (r) => Date.now() - new Date(r.created_at).getTime() < 60_000
    );
    if (fresh.length > 0) {
      // listRuns returns newest first.
      return { id: fresh[0].id, html_url: fresh[0].html_url };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
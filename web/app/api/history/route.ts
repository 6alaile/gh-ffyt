import { NextResponse } from "next/server";
import { listRuns, repoEnv } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let env;
  try { env = repoEnv(); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  try {
    const runs = await listRuns({ token: env.token, repo: env.repo, workflow: env.workflow, branch: "split" });
    return NextResponse.json({ runs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
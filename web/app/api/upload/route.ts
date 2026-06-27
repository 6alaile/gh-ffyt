import { NextRequest, NextResponse } from "next/server";
import { putContents, repoEnv } from "@/lib/github";
import { sanitizeBriefFilename } from "@/lib/util";

export const runtime = "nodejs";   // need Buffer for base64
export const dynamic = "force-dynamic";

/**
 * POST /api/upload
 *   multipart/form-data: "brief" — .md file
 *
 * Commits the file to briefs/<safe-name>-<short-sha>.md in the configured
 * repo. Returns the new blob sha + the GitHub HTML URL + a short upload id
 * the UI can later pass to /api/render.
 *
 * Notes:
 * - We don't pre-check whether the brief is "valid" — the workflow's
 *   `md2yt from-brief` step will fail loudly if the parse + fill + validate
 *   chain blows up. The user can read the run log on the Actions URL.
 * - Filename gets a short sha suffix to avoid collisions across re-uploads.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("brief");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'expected a file under field name "brief"' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "brief exceeds 2 MB" }, { status: 413 });
  }

  const text = await file.text();
  const safe = sanitizeBriefFilename(file.name);

  let env;
  try {
    env = repoEnv();
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }

  // Provisional path; we'll rewrite with the real sha once we know it.
  // First commit lands at briefs/<safe-stem>-pending.md; we then move it
  // on the second commit. Simpler: include the sha in the path on the
  // first commit by computing it client-side from the bytes — but Node's
  // Buffer.hash isn't available, so instead we do a temporary path and
  // accept the extra commit.
  const uploadId = Date.now().toString(36);
  const finalPath = `briefs/${safe.replace(/\.md$/, "")}-${uploadId}.md`;
  const contentB64 = Buffer.from(text, "utf-8").toString("base64");
  const branch = process.env.GH_REF || undefined;

  let result;
  try {
    result = await putContents({
      token: env.token,
      repo: env.repo,
      path: finalPath,
      contentBase64: contentB64,
      message: `md2yt-web: upload ${safe}`,
      branch,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  return NextResponse.json({
    id: uploadId,
    path: finalPath,
    htmlUrl: result.htmlUrl,
  });

  // Rename to include the short sha. The PUT endpoint lets us move a file
  // by writing to a new path; we keep the original temp file in place
  // (it's tiny) so we don't need a delete API call.
  const finalPath = `briefs/${safe.replace(/\.md$/, "")}-${shortId(first.sha)}.md`;
  try {
    // To "move" without the delete API we just write the same content to
    // the new path and leave the temp file. The workflow only reads the
    // final path, so the orphan is harmless.
    await putContents({
      token: env.token,
      repo: env.repo,
      path: finalPath,
      contentBase64: contentB64,
      message: `md2yt-web: rename ${safe} → ${shortId(first.sha)}`,
      branch,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  return NextResponse.json({
    id: shortId(first.sha),
    path: finalPath,
    htmlUrl: first.htmlUrl.replace(/\/pending\.md$/, `/${shortId(first.sha)}.md`),
  });
}
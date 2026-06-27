/**
 * Shared helpers for the /api routes.
 *
 * Talks to GitHub's REST API with the PAT stored in the Vercel env vars:
 *   GH_TOKEN   — fine-grained PAT with Contents:write on the target repo
 *                (used by /api/upload to commit briefs/ + by /api/download
 *                to fetch artifacts)
 *   GH_REPO    — "owner/repo" of the target repo
 *   GH_WORKFLOW_FILE — workflow filename (default "render-and-upload.yml")
 *
 * Nothing here is exposed to the browser; every route runs in a Vercel
 * serverless function.
 */

const GH_API = "https://api.github.com";

export function repoEnv(): { token: string; repo: string; workflow: string } {
  const token = required("GH_TOKEN");
  const repo = required("GH_REPO");
  const workflow = process.env.GH_WORKFLOW_FILE || "render-and-upload.yml";
  return { token, repo, workflow };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

async function gh(
  path: string,
  init: RequestInit & { token: string }
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${init.token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${GH_API}${path}`, { ...init, headers });
  return res;
}

/** PUT a file's contents to the repo. Returns the new blob sha. */
export async function putContents(opts: {
  token: string;
  repo: string;
  path: string;       // e.g. "briefs/example.md"
  contentBase64: string;
  message: string;
  // Optional branch override. Defaults to the repo's default branch
  // (usually "main") when omitted. Set this from process.env.GH_REF in
  // /api/upload so a brief lands on the same ref the dispatch will run
  // on — the contents API would otherwise write to the default branch
  // and the dispatched workflow would see "file not found".
  branch?: string;
}): Promise<{ sha: string; htmlUrl: string }> {
  // Check for an existing sha so we can update instead of fail on 422.
  const get = await gh(
    `/repos/${opts.repo}/contents/${opts.path.split("/").map(encodeURIComponent).join("/")}`,
    { method: "GET", token: opts.token }
  );
  let existingSha: string | undefined;
  if (get.ok) {
    const j = await get.json();
    existingSha = j.sha;
  }

  const body: Record<string, unknown> = {
    message: opts.message,
    content: opts.contentBase64,
  };
  if (opts.branch) body.branch = opts.branch;
  if (existingSha) body.sha = existingSha;

  const put = await gh(`/repos/${opts.repo}/contents/${opts.path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT",
    token: opts.token,
    body: JSON.stringify(body),
  });
  if (!put.ok) {
    const text = await put.text();
    throw new Error(`GitHub PUT ${opts.path} failed: ${put.status} ${text}`);
  }
  const j = await put.json();
  return { sha: j.content.sha, htmlUrl: j.content.html_url };
}

/** Dispatch a workflow run. Inputs must be strings (GitHub's contract). */
export async function dispatchWorkflow(opts: {
  token: string;
  repo: string;
  workflow: string;       // file name, e.g. "render-and-upload.yml"
  ref: string;            // branch or tag, e.g. "main"
  inputs: Record<string, string>;
}): Promise<void> {
  const res = await gh(
    `/repos/${opts.repo}/actions/workflows/${encodeURIComponent(opts.workflow)}/dispatches`,
    {
      method: "POST",
      token: opts.token,
      body: JSON.stringify({ ref: opts.ref, inputs: opts.inputs }),
    }
  );
  // 204 No Content is the success response. 404 means the workflow file
  // doesn't exist on the ref.
  if (res.status !== 204) {
    const text = await res.text();
    throw new Error(`workflow_dispatch failed: ${res.status} ${text}`);
  }
}

export type RunStatus = {
  id: number;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null | string;
  html_url: string;
};

export async function getRun(opts: {
  token: string;
  repo: string;
  runId: number;
}): Promise<RunStatus> {
  const r = await gh(`/repos/${opts.repo}/actions/runs/${opts.runId}`, {
    method: "GET",
    token: opts.token,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`get run ${opts.runId} failed: ${r.status} ${text}`);
  }
  const j = await r.json();
  return {
    id: j.id,
    status: j.status,
    conclusion: j.conclusion,
    html_url: j.html_url,
  };
}

export type ArtifactRef = { id: number; name: string; size_in_bytes: number };

export async function listArtifacts(opts: {
  token: string;
  repo: string;
  runId: number;
}): Promise<ArtifactRef[]> {
  const r = await gh(`/repos/${opts.repo}/actions/runs/${opts.runId}/artifacts`, {
    method: "GET",
    token: opts.token,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`list artifacts ${opts.runId} failed: ${r.status} ${text}`);
  }
  const j = await r.json();
  return (j.artifacts ?? []).map((a: { id: number; name: string; size_in_bytes: number }) => ({
    id: a.id,
    name: a.name,
    size_in_bytes: a.size_in_bytes,
  }));
}

export type RunListItem = {
  id: number;
  created_at: string;
  html_url: string;
  status: string;
  conclusion: string | null;
};

export async function listRuns(opts: {
  token: string;
  repo: string;
  workflow: string;
  branch?: string;
}): Promise<RunListItem[]> {
  const r = await gh(
    `/repos/${opts.repo}/actions/workflows/${encodeURIComponent(opts.workflow)}/runs?per_page=10${opts.branch ? `&branch=${opts.branch}` : ""}`,
    { method: "GET", token: opts.token }
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`list runs for ${opts.workflow} failed: ${r.status} ${text}`);
  }
  const j = await r.json();
  return (j.workflow_runs ?? []).map((x: {
    id: number;
    created_at: string;
    html_url: string;
    status: string;
    conclusion: string | null;
  }) => ({
    id: x.id,
    created_at: x.created_at,
    html_url: x.html_url,
    status: x.status,
    conclusion: x.conclusion,
  }));
}

/** Redirect-to-artifact: returns the signed zip download URL. */
export async function artifactDownloadUrl(opts: {
  token: string;
  repo: string;
  artifactId: number;
}): Promise<string> {
  // The REST endpoint returns 302 to a signed S3 URL.
  const r = await fetch(
    `${GH_API}/repos/${opts.repo}/actions/artifacts/${opts.artifactId}/zip`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
      },
      redirect: "manual",
    }
  );
  if (r.status !== 302) {
    throw new Error(`artifact ${opts.artifactId}: expected 302, got ${r.status}`);
  }
  const loc = r.headers.get("location");
  if (!loc) {
    throw new Error(`artifact ${opts.artifactId}: 302 missing Location header`);
  }
  return loc;
}
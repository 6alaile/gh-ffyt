"use client";

import { useEffect, useRef, useState } from "react";

type Upload = {
  id: string;        // short id (sha-prefix)
  path: string;      // repo path of the committed .md
  htmlUrl: string;   // github.com link to the committed file
};

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string }
  | { phase: "uploaded"; upload: Upload }
  | { phase: "dispatching"; upload: Upload; actionsUrl: string }
  | { phase: "running"; upload: Upload; runId: number; actionsUrl: string }
  | { phase: "ok"; upload: Upload; runId: number; artifacts: { spec: string | null; mp4: string | null; log: string | null } }
  | { phase: "failed"; message: string };

export default function HomePage() {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [pollHandle, setPollHandle] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Poll /api/status while a render is running, then stop.
  useEffect(() => {
    if (status.phase !== "running" || pollHandle !== null) return;
    const handle = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/status?run_id=${status.runId}`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.status === "completed") {
          window.clearInterval(handle);
          setPollHandle(null);
          setStatus({
            phase: "ok",
            upload: status.upload,
            runId: status.runId,
            artifacts: {
              spec: data.artifactPaths.spec ?? null,
              mp4:  data.artifactPaths.mp4  ?? null,
              log:  data.artifactPaths.log  ?? null,
            },
          });
        } else if (data.status === "failed") {
          window.clearInterval(handle);
          setPollHandle(null);
          setStatus({ phase: "failed", message: data.conclusion ?? "render failed" });
        }
      } catch {
        // transient network error — keep polling
      }
    }, 5000);
    setPollHandle(handle);
    return () => {
      window.clearInterval(handle);
    };
  }, [status, pollHandle]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStatus({ phase: "uploading", fileName: file.name });

    const fd = new FormData();
    fd.append("brief", file);

    const upRes = await fetch("/api/upload", { method: "POST", body: fd });
    if (!upRes.ok) {
      const err = await upRes.json().catch(() => ({}));
      setStatus({ phase: "failed", message: `upload failed: ${err.error ?? upRes.statusText}` });
      return;
    }
    const upload: Upload = await upRes.json();
    setStatus({ phase: "uploaded", upload });
  }

  async function onRender() {
    if (status.phase !== "uploaded") return;
    setStatus({ phase: "dispatching", upload: status.upload });

    const r = await fetch("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: status.upload.id, briefPath: status.upload.path }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      setStatus({ phase: "failed", message: `dispatch failed: ${err.error ?? r.statusText}` });
      return;
    }
    const { runId, actionsUrl } = await r.json();
    if (typeof runId === "number") {
      setStatus({ phase: "running", upload: status.upload, runId, actionsUrl });
    } else {
      // dispatchPending=true: server hasn't located the run yet. Send
      // the user to the workflow's runs list and let the next status
      // poll reconcile. (Use the repo+workflow URL we already know.)
      setStatus({ phase: "dispatching", upload: status.upload, actionsUrl });
    }
  }

  function reset() {
    if (fileRef.current) fileRef.current.value = "";
    setStatus({ phase: "idle" });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">MD2YT</h1>
        <p className="mt-2 text-muted">
          Upload a markdown content brief. We commit it to your repo, dispatch the
          render workflow, and hand you the spec + MP4 when it&apos;s done.
        </p>
      </header>

      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">1. Upload a brief</h2>
        <form onSubmit={onUpload} className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown"
            disabled={status.phase !== "idle"}
            className="block w-full text-sm file:mr-4 file:rounded-md file:border-0
                       file:bg-accent file:px-4 file:py-2 file:font-medium file:text-bg
                       hover:file:bg-accentDim
                       disabled:opacity-50"
          />
          <button
            type="submit"
            className="btn-primary self-start"
            disabled={status.phase !== "idle"}
          >
            {status.phase === "uploading" ? "Uploading…" : "Upload"}
          </button>
        </form>
      </section>

      {status.phase === "uploaded" && (
        <section className="card mb-8">
          <h2 className="mb-4 text-lg font-semibold">2. Render</h2>
          <p className="mb-4 text-sm text-muted">
            Committed <code className="text-accent">{status.upload.path}</code>.{" "}
            <a className="underline hover:text-accent" href={status.upload.htmlUrl} target="_blank" rel="noreferrer">
              View on GitHub →
            </a>
          </p>
          <button onClick={onRender} className="btn-primary">
            Dispatch render workflow
          </button>
        </section>
      )}

      {(status.phase === "dispatching" || status.phase === "running") && (
        <section className="card mb-8">
          <h2 className="mb-4 text-lg font-semibold">3. Rendering</h2>
          <p className="mb-2">
            <span className="badge-running">running</span>{" "}
            <a className="ml-2 text-sm text-accent underline" href={status.actionsUrl} target="_blank" rel="noreferrer">
              view on GitHub Actions →
            </a>
          </p>
          <p className="text-sm text-muted">Polling every 5 s. Keep this tab open.</p>
        </section>
      )}

      {status.phase === "ok" && (
        <section className="card mb-8">
          <h2 className="mb-4 text-lg font-semibold">4. Done</h2>
          <p className="mb-4">
            <span className="badge-ok">ok</span>{" "}
            <a className="ml-2 text-sm text-accent underline" href={`https://github.com/${process.env.NEXT_PUBLIC_GH_REPO}/actions/runs/${status.runId}`} target="_blank" rel="noreferrer">
              Actions run →
            </a>
          </p>
          <div className="flex flex-col gap-2 text-sm">
            {status.artifacts.spec && (
              <a className="text-accent underline" href={`/api/download?run_id=${status.runId}&name=spec.json`}>
                Download spec.json
              </a>
            )}
            {status.artifacts.mp4 && (
              <a className="text-accent underline" href={`/api/download?run_id=${status.runId}&name=${encodeURIComponent(status.artifacts.mp4)}`}>
                Download MP4
              </a>
            )}
          </div>
          <button onClick={reset} className="btn-ghost mt-6">
            Start another render
          </button>
        </section>
      )}

      {status.phase === "failed" && (
        <section className="card mb-8 border-danger">
          <h2 className="mb-4 text-lg font-semibold text-danger">Failed</h2>
          <p className="text-sm">{status.message}</p>
          <button onClick={reset} className="btn-ghost mt-6">
            Try again
          </button>
        </section>
      )}
    </main>
  );
}
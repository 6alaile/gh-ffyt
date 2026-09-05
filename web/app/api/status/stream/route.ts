import { NextRequest, NextResponse } from "next/server";
import { getRun, listArtifacts, repoEnv } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/status/stream?run_id=123
 *
 * Server-Sent Events endpoint for real-time run status updates.
 * Sends updates every 2 seconds until run completes.
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

  // Create SSE stream
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sendError = (error: string) => {
        sendEvent({ error, timestamp: Date.now() });
        closed = true;
        controller.close();
      };

      // Initial fetch
      let run;
      try {
        run = await getRun({ token: env.token, repo: env.repo, runId });
      } catch (e) {
        sendError((e as Error).message);
        return;
      }

      // Send initial state
      sendEvent({
        runId: run.id,
        status: run.status === "in_progress" ? "running" : run.status === "queued" ? "queued" : "completed",
        conclusion: run.conclusion,
        progress: 0,
        htmlUrl: run.html_url,
        timestamp: Date.now(),
      });

      // If already completed, send artifacts and close
      if (run.status === "completed") {
        let arts;
        try {
          arts = await listArtifacts({ token: env.token, repo: env.repo, runId });
        } catch (e) {
          sendError((e as Error).message);
          return;
        }

        const artifactPaths: Record<string, string> = {};
        for (const art of arts) {
          if (art.name === "spec.json") artifactPaths.spec = art.name;
          else if (art.name.endsWith(".mp4")) artifactPaths.mp4 = art.name;
          else if (art.name === "render-log") artifactPaths.log = art.name;
        }

        sendEvent({
          runId: run.id,
          status: "completed",
          conclusion: run.conclusion,
          progress: 100,
          artifactPaths,
          timestamp: Date.now(),
        });
        closed = true;
        controller.close();
        return;
      }

      // Poll for updates
      let progress = 0;
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          const currentRun = await getRun({ token: env.token, repo: env.repo, runId });

          // Simulate progress for running builds
          if (currentRun.status === "in_progress") {
            progress = Math.min(progress + Math.random() * 15, 95);
          }

          sendEvent({
            runId: currentRun.id,
            status: currentRun.status === "in_progress" ? "running" : currentRun.status === "queued" ? "queued" : "completed",
            conclusion: currentRun.conclusion,
            progress: Math.round(progress),
            htmlUrl: currentRun.html_url,
            timestamp: Date.now(),
          });

          if (currentRun.status === "completed") {
            clearInterval(interval);

            // Fetch artifacts
            let arts;
            try {
              arts = await listArtifacts({ token: env.token, repo: env.repo, runId });
            } catch (e) {
              sendError((e as Error).message);
              return;
            }

            const artifactPaths: Record<string, string> = {};
            for (const art of arts) {
              if (art.name === "spec.json") artifactPaths.spec = art.name;
              else if (art.name.endsWith(".mp4")) artifactPaths.mp4 = art.name;
              else if (art.name === "render-log") artifactPaths.log = art.name;
            }

            sendEvent({
              runId: currentRun.id,
              status: "completed",
              conclusion: currentRun.conclusion,
              progress: 100,
              artifactPaths,
              timestamp: Date.now(),
            });

            closed = true;
            controller.close();
          }
        } catch (e) {
          console.error("SSE poll error:", e);
          // Don't close on transient errors
        }
      }, 3000); // Poll every 3 seconds

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        closed = true;
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
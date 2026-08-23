"use client";

import { useEffect, useRef, useState } from "react";

type Artifact = {
  name: string;
  url: string;
  type: "mp4" | "srt" | "json";
};

type DashboardState = {
  aspect: "16:9" | "9:16";
  enhanced: boolean;
  artifacts: Artifact[];
  loading: boolean;
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    aspect: "16:9",
    enhanced: false,
    artifacts: [],
    loading: false,
  });

  // Toggle aspect ratio
  const toggleAspect = () => {
    setState((s) => ({ ...s, aspect: s.aspect === "16:9" ? "9:16" : "16:9" }));
  };

  // Enhance scripts (run script writer agent)
  const enhanceScripts = async () => {
    setState((s) => ({ ...s, loading: true }));
    // In production, call the pipeline's script writer agent
    // For now, just mark as enhanced
    setState((s) => ({ ...s, enhanced: true, loading: false }));
  };

  // View artifacts from current run
  const loadArtifacts = async () => {
    setState((s) => ({ ...s, loading: true }));
    // In production, fetch artifacts from the GitHub Actions run
    // For now, use mock data
    const mock: Artifact[] = [
      { name: "spec.json", url: "/api/download?run_id=1&name=spec.json", type: "json" },
      { name: "video.mp4", url: "/api/download?run_id=1&name=video.mp4", type: "mp4" },
    ];
    setState((s) => ({ ...s, artifacts: mock, loading: false }));
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">MD2YT — Dashboard</h1>
        <p className="mt-2 text-muted">
          Control panel for your video project — orientation, enhancement, and artifacts.
        </p>
      </header>

      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">1. Orientation</h2>
        <p className="text-sm text-muted mb-4">
          Video aspect ratio. Shorts (9:16) are your discovery engine; 16:9 is your
          retention & SEO pillar.
        </p>
        <div className="flex gap-4">
          <button
            onClick={toggleAspect}
            className="btn-primary px-6 py-2"
            style={{ background: state.aspect === "16:9" ? "var(--accent)" : "var(--muted)" }}
          >
            {state.aspect === "16:9" ? "Switch to 9:16 (Shorts)" : "Switch to 16:9 (Long-form)"}
          </button>
          <span className="text-sm text-muted">
            Current: {state.aspect}
          </span>
        </div>
        <p className="text-xs text-muted mt-2">
          Shorts (9:16) = discovery engine. Every breakout faceless channel grew on
          Shorts first (GoalRush, FREEZZ, KE TECH). 1 per week is enough to start.
        </p>
      </section>

      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">2. Enhance Scripts</h2>
        <p className="text-sm text-muted mb-4">
          Run the AI script writer to add narrative emphasis, word timings, and CTA
          notes to all scenes. Uses your configured LLM (Omniroute) or rule-based
          fallback.
        </button>
          {state.enhanced ? (
            <p className="text-sm text-muted">Scripts already enhanced</p>
          ) : (
            <button
              onClick={enhanceScripts}
              className="btn-primary"
              disabled={state.loading}
            >
              {state.loading ? "Enhancing..." : "Enhance Scripts"}
            </button>
          )
        </p>
      </section>

      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">3. Artifact Viewer</h2>
        <p className="text-sm text-muted mb-4">
          Rendered outputs from the current GitHub Actions run. Download spec, MP4, or SRT.
        </p>
        {state.loading ? (
          <p className="text-sm text-muted">Loading artifacts...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {state.artifacts.map((art) => (
              <div key={art.name} className="border rounded-md p-4 hover:border-accent transition">
                <a
                  href={art.url}
                  className="text-accent underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {art.name}
                </a>
                <span className="text-xs text-muted block mt-1">{art.type}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={loadArtifacts}
          className="btn-primary mt-4 w-full"
          disabled={state.loading}
        >
          Refresh Artifacts
        </button>
      </section>

      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">4. Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => window.location.href="/brief-form"}
            className="btn-primary"
          >
            Create Brief
          </button>
          <button
            onClick={() => window.location.href="/"}
            className="btn-ghost"
          >
            Back to Home
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          Full pipeline: Conversation → Research → Brief → Spec → Render → MP4
        </p>
      </section>
    </main>
  );
}

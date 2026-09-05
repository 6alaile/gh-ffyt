"use client";

import { useEffect, useState, useCallback } from "react";

type Artifact = {
  name: string;
  url: string;
  type: "mp4" | "srt" | "json";
};

type Run = {
  id: number;
  created_at: string;
  html_url: string;
  status: string;
  conclusion: string | null;
};

type AspectMode = "long-form" | "shorts";

type DashboardState = {
  aspectMode: AspectMode;
  enhanced: boolean;
  artifacts: Artifact[];
  loading: boolean;
  runId: number | null;
  runStatus: string | null;
  runConclusion: string | null;
  runs: Run[];
  selectedRun: Run | null;
  pollInterval: NodeJS.Timeout | null;
};

const ASPECT_CONFIG: Record<AspectMode, { label: string; description: string; ratio: "16:9" | "9:16" }> = {
  "long-form": { label: "Long Form", description: "16:9 — retention, SEO, evergreen", ratio: "16:9" },
  "shorts": { label: "Shorts", description: "9:16 — discovery, viral reach, 60s max", ratio: "9:16" },
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    aspectMode: "long-form",
    enhanced: false,
    artifacts: [],
    loading: false,
    runId: null,
    runStatus: null,
    runConclusion: null,
    runs: [],
    selectedRun: null,
    pollInterval: null,
  });

  // Set aspect mode
  const setAspectMode = useCallback((mode: AspectMode) => {
    setState((s) => ({ ...s, aspectMode: mode }));
  }, []);

  // Enhance scripts (run script writer agent)
  const enhanceScripts = async () => {
    setState((s) => ({ ...s, loading: true }));
    // In production, call the pipeline's script writer agent
    // For now, just mark as enhanced
    setState((s) => ({ ...s, enhanced: true, loading: false }));
  };

  // Load runs history from GitHub Actions
  const loadRuns = async () => {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      setState((s) => ({ ...s, runs: data.runs }));
    } catch (err) {
      console.error("Failed to load runs:", err);
    }
  };

  // Load artifacts for a specific run
  const loadArtifacts = useCallback(async (runId: number) => {
    setState((s) => ({ ...s, loading: true, runId }));
    try {
      const res = await fetch(`/api/status?run_id=${runId}`);
      if (!res.ok) throw new Error("Failed to fetch artifacts");
      const data = await res.json();

      // Build artifact list from status response
      const artifacts: Artifact[] = [];
      if (data.artifactPaths?.spec) {
        artifacts.push({ name: data.artifactPaths.spec, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.spec}`, type: "json" });
      }
      if (data.artifactPaths?.mp4) {
        artifacts.push({ name: data.artifactPaths.mp4, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.mp4}`, type: "mp4" });
      }
      if (data.artifactPaths?.log) {
        artifacts.push({ name: data.artifactPaths.log, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.log}`, type: "json" });
      }

      setState((s) => ({
        ...s,
        artifacts,
        loading: false,
        runStatus: data.status,
        runConclusion: data.conclusion,
        selectedRun: s.runs.find((r) => r.id === runId) || null,
      }));
    } catch (err) {
      console.error("Failed to load artifacts:", err);
      setState((s) => ({ ...s, loading: false, artifacts: [] }));
    }
  }, []);

  // Select a run from the list
  const selectRun = useCallback((run: Run) => {
    loadArtifacts(run.id);
  }, [loadArtifacts]);

  // Poll run status for real-time updates
  const startPolling = useCallback((runId: number) => {
    setState((s) => {
      if (s.pollInterval) clearInterval(s.pollInterval);
      const interval = setInterval(() => {
        loadArtifacts(runId);
      }, 5000);
      return { ...s, pollInterval: interval };
    });
  }, [loadArtifacts]);

  const stopPolling = useCallback(() => {
    setState((s) => {
      if (s.pollInterval) clearInterval(s.pollInterval);
      return { ...s, pollInterval: null };
    });
  }, []);

  // Load runs on mount
  useEffect(() => {
    loadRuns();
    return () => stopPolling();
  }, [loadRuns, stopPolling]);

  const currentAspect = ASPECT_CONFIG[state.aspectMode];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">MD2YT — Dashboard</h1>
        <p className="mt-2 text-muted">
          Control panel for your video project — orientation, enhancement, and artifacts.
        </p>
      </header>

      {/* 1. Aspect Ratio Toggle — defaults to Long Form */}
      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">1. Aspect Ratio</h2>
        <p className="text-sm text-muted mb-4">
          Choose your output format. Defaults to <strong>Long Form (16:9)</strong> for
          retention & SEO; switch to <strong>Shorts (9:16)</strong> for discovery.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {(["long-form", "shorts"] as AspectMode[]).map((mode) => {
            const config = ASPECT_CONFIG[mode];
            const isActive = state.aspectMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setAspectMode(mode)}
                className={`relative p-6 rounded-xl border-2 transition-all duration-200 ${
                  isActive
                    ? "border-accent bg-accent/5 shadow-lg shadow-accent/10"
                    : "border-border hover:border-accent/50 hover:bg-muted/50"
                }`}
              >
                <div className="absolute top-2 right-2">
                  {isActive && (
                    <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="relative z-10">
                  <h3 className="text-xl font-semibold mb-1">{config.label}</h3>
                  <p className="text-sm text-muted">{config.description}</p>
                  <div className="mt-4 h-8 bg-gray-100 rounded flex items-center justify-center">
                    <span className="text-xs font-mono text-muted">
                      {config.ratio}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted mt-4">
          Current: <strong>{ASPECT_CONFIG[state.aspectMode].label}</strong> ({ASPECT_CONFIG[state.aspectMode].ratio}) —
          this setting passes to the render pipeline via <code className="px-1.5 py-0.5 bg-muted rounded text-xs">--aspect={ASPECT_CONFIG[state.aspectMode].ratio}</code>
        </p>
      </section>

      {/* 2. Script Enhancement */}
      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">2. AI Script Enhancement</h2>
        <p className="text-sm text-muted mb-4">
          Run the script writer agent to add narrative emphasis, word-level timings,
          and CTA notes to all scenes. Uses your configured LLM (Omniroute → Gemini
          → OpenRouter → rule-based fallback).
        </p>
        <div className="flex items-center gap-4">
          {state.enhanced ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-green-800">Scripts enhanced</span>
            </div>
          ) : (
            <button
              onClick={enhanceScripts}
              className="btn-primary"
              disabled={state.loading}
            >
              {state.loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Enhancing...
                </>
              ) : (
                "Enhance Scripts"
              )}
            </button>
          )}
        </div>
      </section>

      {/* 3. Pipeline Runs — with live status */}
      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">3. Pipeline Runs</h2>
        <p className="text-sm text-muted mb-4">
          Recent GitHub Actions workflow runs. Click a run to view artifacts; running
          runs auto-refresh every 5s.
        </p>
        {state.loading && state.runs.length === 0 ? (
          <div className="flex items-center gap-3 p-4">
            <svg className="animate-spin h-5 w-5 text-accent" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
            </svg>
            <span className="text-sm">Loading runs...</span>
          </div>
        ) : state.runs.length === 0 ? (
          <div className="p-6 text-center border-2 border-dashed border-border rounded-lg">
            <svg className="mx-auto h-12 w-12 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="mt-3 text-muted">No runs found</p>
            <p className="text-xs text-muted mt-1">Create a brief to start your first run</p>
            <button onClick={() => window.location.href = "/brief-form"} className="btn-primary mt-4 inline-block">
              Create Brief
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {state.runs.slice(0, 15).map((run) => {
              const isSelected = state.selectedRun?.id === run.id;
              const isRunning = run.status === "in_progress" || run.status === "queued";
              return (
                <button
                  key={run.id}
                  onClick={() => selectRun(run)}
                  className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
                    isSelected
                      ? "border-accent bg-accent/5 shadow-md"
                      : "border-border hover:border-accent/50 hover:bg-muted/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        run.status === "completed" ? "bg-green-500" :
                        run.status === "in_progress" ? "bg-blue-500 animate-pulse" :
                        run.status === "queued" ? "bg-yellow-500 animate-pulse" :
                        "bg-gray-400"
                      }`} />
                      <div>
                        <span className="font-medium">Run #{run.id}</span>
                        <span className="text-xs text-muted ml-2">
                          {new Date(run.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                        run.status === "completed" ? "bg-green-100 text-green-800" :
                        run.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                        run.status === "queued" ? "bg-yellow-100 text-yellow-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {run.status === "in_progress" ? "Running" :
                         run.status === "queued" ? "Queued" :
                         run.status === "completed" ? "Completed" : run.status}
                      </span>
                      {run.conclusion && (
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                          run.conclusion === "success" ? "bg-green-100 text-green-800" :
                          run.conclusion === "failure" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {run.conclusion}
                        </span>
                      )}
                      {isRunning && (
                        <span className="text-xs text-muted flex items-center gap-1">
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
                          </svg>
                          Live
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Artifacts for Selected Run — with live polling */}
      {state.runId && (
        <section className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">4. Artifacts for Run #{state.runId}</h2>
            <div className="flex items-center gap-3">
              {state.runStatus && (
                <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                  state.runStatus === "completed" ? "bg-green-100 text-green-800" :
                  state.runStatus === "running" ? "bg-blue-100 text-blue-800 animate-pulse" :
                  state.runStatus === "queued" ? "bg-yellow-100 text-yellow-800 animate-pulse" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {state.runStatus === "running" ? "Running" :
                   state.runStatus === "queued" ? "Queued" :
                   state.runStatus === "completed" ? "Completed" : state.runStatus}
                </span>
              )}
              {state.runConclusion && state.runStatus === "completed" && (
                <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                  state.runConclusion === "success" ? "bg-green-100 text-green-800" :
                  state.runConclusion === "failure" ? "bg-red-100 text-red-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {state.runConclusion}
                </span>
              )}
            </div>
          </div>

          {state.loading ? (
            <div className="flex items-center justify-center gap-3 p-8">
              <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
              </svg>
              <span className="text-sm text-muted">Loading artifacts...</span>
            </div>
          ) : state.artifacts.length === 0 ? (
            <div className="p-6 text-center border-2 border-dashed border-border rounded-lg">
              <svg className="mx-auto h-10 w-10 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mt-3 text-muted">No artifacts yet</p>
              {state.runStatus === "running" && (
                <p className="text-xs text-muted mt-1">Run in progress — artifacts appear when complete</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {state.artifacts.map((art) => (
                <a
                  key={art.name}
                  href={art.url}
                  className="group border rounded-xl p-4 hover:border-accent hover:bg-accent/5 transition-all duration-200 flex items-center gap-4"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    art.type === "mp4" ? "bg-purple-100 text-purple-700" :
                    art.type === "json" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {art.type === "mp4" && (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {art.type === "json" && (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {art.type === "srt" && (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{art.name}</p>
                    <span className="text-xs text-muted uppercase tracking-wide">{art.type}</span>
                  </div>
                  <svg className="w-5 h-5 text-muted group-hover:text-accent transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => state.runId && loadArtifacts(state.runId)}
              className="btn-primary flex-1"
              disabled={state.loading}
            >
              {state.loading ? "Refreshing..." : "Refresh Artifacts"}
            </button>
            {state.runStatus === "running" && state.pollInterval && (
              <button
                onClick={stopPolling}
                className="btn-ghost"
              >
                Stop Auto-refresh
              </button>
            )}
            {state.runStatus === "running" && !state.pollInterval && (
              <button
                onClick={() => state.runId && startPolling(state.runId)}
                className="btn-ghost"
              >
                Start Auto-refresh
              </button>
            )}
          </div>
        </section>
      )}

      {/* 5. Quick Actions */}
      <section className="card mb-8">
        <h2 className="mb-4 text-lg font-semibold">5. Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => window.location.href = "/brief-form"}
            className="btn-primary py-3"
          >
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Brief
          </button>
          <button
            onClick={() => window.location.href = "/"}
            className="btn-ghost py-3"
          >
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </button>
        </div>
        <p className="text-xs text-muted mt-2 text-center">
          Full pipeline: <code className="px-1.5 py-0.5 bg-muted rounded">Conversation</code> →
          <code className="px-1.5 py-0.5 bg-muted rounded">Research</code> →
          <code className="px-1.5 py-0.5 bg-muted rounded">Brief</code> →
          <code className="px-1.5 py-0.5 bg-muted rounded">Spec</code> →
          <code className="px-1.5 py-0.5 bg-muted rounded">Render</code> →
          <code className="px-1.5 py-0.5 bg-muted rounded">MP4</code>
        </p>
      </section>

      {/* 6. Current Configuration Summary */}
      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">6. Current Configuration</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Aspect Ratio</dt>
            <dd className="font-medium">{ASPECT_CONFIG[state.aspectMode].label} ({ASPECT_CONFIG[state.aspectMode].ratio})</dd>
          </div>
          <div>
            <dt className="text-muted">Script Enhancement</dt>
            <dd className="font-medium">{state.enhanced ? "Enabled" : "Disabled (rule-based)"}</dd>
          </div>
          <div>
            <dt className="text-muted">Selected Run</dt>
            <dd className="font-medium">{state.runId ? `#${state.runId}` : "None"}</dd>
          </div>
          <div>
            <dt className="text-muted">Run Status</dt>
            <dd className="font-medium">{state.runStatus || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Artifacts Ready</dt>
            <dd className="font-medium">{state.artifacts.length}</dd>
          </div>
          <div>
            <dt className="text-muted">History Loaded</dt>
            <dd className="font-medium">{state.runs.length} runs</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
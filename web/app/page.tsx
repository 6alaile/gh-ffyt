"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { gsap } from "gsap";
import { AspectSelector } from "@/components/dashboard/AspectSelector";
import { RunList } from "@/components/dashboard/RunList";
import { ArtifactCard } from "@/components/dashboard/ArtifactCard";
import { EnhancementCard } from "@/components/dashboard/EnhancementCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";

type Artifact = {
  name: string;
  url: string;
  type: "mp4" | "srt" | "json" | "log";
  size?: number;
};

type Run = {
  id: number;
  created_at: string;
  html_url: string;
  status: "completed" | "in_progress" | "queued" | "failure" | "cancelled";
  conclusion: "success" | "failure" | "cancelled" | "neutral" | "skipped" | "timed_out" | "action_required" | null;
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
  enhancementStage: "idle" | "processing" | "complete" | "error";
  enhancementLog: string[];
  enhancementDiff: { before: string; after: string }[];
};

const STORAGE_KEY = "md2yt-dashboard";

function getInitialState(): DashboardState {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          aspectMode: parsed.aspectMode || "long-form",
          enhanced: false,
          artifacts: [],
          loading: false,
          runId: null,
          runStatus: null,
          runConclusion: null,
          runs: [],
          selectedRun: null,
          enhancementStage: "idle",
          enhancementLog: [],
          enhancementDiff: [],
          ...parsed,
        };
      }
    } catch {}
  }
  return {
    aspectMode: "long-form",
    enhanced: false,
    artifacts: [],
    loading: false,
    runId: null,
    runStatus: null,
    runConclusion: null,
    runs: [],
    selectedRun: null,
    enhancementStage: "idle",
    enhancementLog: [],
    enhancementDiff: [],
  };
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>(getInitialState);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist aspect mode and enhanced state
  useEffect(() => {
    setMounted(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        aspectMode: state.aspectMode,
        enhanced: state.enhanced,
      }));
    } catch {}
  }, [state.aspectMode, state.enhanced]);

  // Page entrance animation
  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    gsap.from(containerRef.current.querySelectorAll(".stagger-in"), {
      y: 24,
      opacity: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: "power3.out",
    });
  }, [mounted]);

  const setAspectMode = useCallback((mode: AspectMode) => {
    setState((s) => ({ ...s, aspectMode: mode }));
  }, []);

  const currentAspect = state.aspectMode;

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      setState((s) => ({ ...s, runs: data.runs }));
    } catch (err) {
      console.error("Failed to load runs:", err);
    }
  }, []);

  const loadArtifacts = useCallback(async (runId: number) => {
    setState((s) => ({ ...s, loading: true, runId }));
    try {
      const res = await fetch(`/api/status?run_id=${runId}`);
      if (!res.ok) throw new Error("Failed to fetch artifacts");
      const data = await res.json();

      const artifacts: Artifact[] = [];
      if (data.artifactPaths?.spec) {
        artifacts.push({ name: data.artifactPaths.spec, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.spec}`, type: "json" });
      }
      if (data.artifactPaths?.mp4) {
        artifacts.push({ name: data.artifactPaths.mp4, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.mp4}`, type: "mp4" });
      }
      if (data.artifactPaths?.log) {
        artifacts.push({ name: data.artifactPaths.log, url: `/api/download?run_id=${runId}&name=${data.artifactPaths.log}`, type: "log" });
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

  const selectRun = useCallback((run: Run) => {
    loadArtifacts(run.id);
  }, [loadArtifacts]);

  const enhanceScripts = useCallback(async () => {
    setState((s) => ({
      ...s,
      enhancementStage: "processing",
      enhancementLog: ["Initializing script writer agent...", "Connecting to LLM provider..."],
      enhancementDiff: [],
    }));

    // Simulate processing with log updates
    const steps = [
      "Loading scene specifications...",
      "Analyzing narrative structure...",
      "Generating emphasis markers...",
      "Computing word-level timings...",
      "Adding CTA annotations...",
      "Validating enhanced scripts...",
      "Writing enhanced spec...",
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
      setState((s) => ({ ...s, enhancementLog: [...s.enhancementLog, steps[i]] }));
    }

    // Simulate success with diff
    const diff = [
      { before: 'script: "The team collapsed in the second half."', after: 'script: "The <accent>team collapsed</accent> in the second half."\nword_timings: [[0,2],[2,4],[4,6]]\nemphasis_notes: ["team collapsed"]' },
      { before: 'script: "Three goals conceded from set pieces."', after: 'script: "<accent>Three goals</accent> conceded from set pieces."\nword_timings: [[0,1],[1,3],[3,5]]\nemphasis_notes: ["Three goals"]' },
    ];

    setState((s) => ({
      ...s,
      enhanced: true,
      enhancementStage: "complete",
      enhancementDiff: diff,
      enhancementLog: [...s.enhancementLog, "✓ Enhancement complete"],
    }));
  }, []);

  // Load runs on mount
  useEffect(() => {
    if (mounted) {
      loadRuns();
    }
  }, [mounted, loadRuns]);

if (!mounted) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-[fg-muted]">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
          </svg>
          <span className="text-lg">Loading Dashboard...</span>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="surface p-8 text-center mx-auto max-w-7xl px-6 py-8" role="alert">
          <svg className="mx-auto h-12 w-12 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10" strokeLinecap="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
          </svg>
          <h3 className="mt-4 text-lg font-medium">Dashboard failed to load</h3>
          <p className="mt-1 text-[fg-muted]">Please refresh the page or try again later.</p>
        </div>
      }
    >
      <main
        ref={containerRef}
        className="min-h-screen bg-bg"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,215,0,0.03) 0%, transparent 70%)" }}
      >
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 w-full border-b border-rule/50 bg-bg/80 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="font-semibold text-xl tracking-tight">MD2YT Dashboard</h1>
              <p className="text-[12px] text-[fg-muted]">Pipeline control • Aspect ratio • Enhancement • Artifacts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[bg-elevated] border border-rule/50 rounded-lg">
              <span className="text-[11px] font-mono text-[fg-muted]">Aspect:</span>
              <span className="font-medium text-accent uppercase tracking-wider">{currentAspect === "long-form" ? "16:9" : "9:16"}</span>
            </div>
            <a
              href="/brief-form"
              className="btn-primary hidden sm:inline-flex"
              aria-label="Create new brief"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New Brief
            </a>
          </div>
        </div>
      </header>

      {/* Mobile header actions */}
      <div className="sm:hidden px-4 py-3 border-b border-rule/50 bg-bg/80 backdrop-blur-lg">
        <a href="/brief-form" className="btn-primary w-full justify-center">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          New Brief
        </a>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Quick Status + Aspect Ratio */}
          <div className="lg:col-span-1 space-y-6 stagger-in">
            {/* Quick Status */}
            <section className="surface p-5" aria-labelledby="status-heading">
              <h2 id="status-heading" className="font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Quick Status
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-[bg-hover] rounded-xl border border-rule/50">
                  <p className="text-2xl font-bold text-accent tabular-nums">{state.runs.filter(r => r.status === "in_progress").length + state.runs.filter(r => r.status === "queued").length}</p>
                  <p className="text-[11px] text-[fg-muted] uppercase tracking-wide">Live</p>
                </div>
                <div className="p-3 bg-[bg-hover] rounded-xl border border-rule/50">
                  <p className="text-2xl font-bold text-success tabular-nums">{state.runs.filter(r => r.conclusion === "success").length}</p>
                  <p className="text-[11px] text-[fg-muted] uppercase tracking-wide">Success</p>
                </div>
                <div className="p-3 bg-[bg-hover] rounded-xl border border-rule/50">
                  <p className="text-2xl font-bold text-danger tabular-nums">{state.runs.filter(r => r.conclusion === "failure").length}</p>
                  <p className="text-[11px] text-[fg-muted] uppercase tracking-wide">Failed</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-rule/50">
                <p className="text-[13px] text-[fg-muted]">
                  {state.runs.length} total runs •
                  {state.runs.length > 0 && (
                    <>
                      <span className="mx-1">{(state.runs.filter(r => r.conclusion === "success").length / state.runs.length * 100).toFixed(0)}% success</span>
                    </>
                  )}
                </p>
              </div>
            </section>

            {/* Aspect Ratio Selector */}
            <section className="surface p-5" aria-labelledby="aspect-heading">
              <h2 id="aspect-heading" className="font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18M15 3v18" />
                </svg>
                Output Format
              </h2>
              <p className="text-[13px] text-[fg-muted] mb-4">
                Defaults to <strong>Long Form</strong> for retention. Switch to <strong>Shorts</strong> for discovery.
              </p>
              <AspectSelector
                value={state.aspectMode}
                onChange={setAspectMode}
              />
              <div className="mt-4 p-3 bg-[bg-hover] rounded-lg border border-rule/50">
                <p className="text-[12px] text-[fg-muted] flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Passes to pipeline as <code className="px-1.5 py-0.5 bg-bg rounded text-[11px] font-mono">--aspect={currentAspect === "long-form" ? "16:9" : "9:16"}</code>
                </p>
              </div>
            </section>
          </div>

          {/* Right Column: Run List + Artifacts */}
          <div className="lg:col-span-2 space-y-6 stagger-in" style={{ animationDelay: "80ms" }}>
            {/* Run List */}
            <RunList
              runs={state.runs}
              selectedRun={state.selectedRun}
              onSelectRun={selectRun}
              onLoadArtifacts={loadArtifacts}
              loading={state.loading && state.runs.length === 0}
              runStatus={state.runStatus}
              runConclusion={state.runConclusion}
              artifacts={state.artifacts}
            />

            {/* Artifacts Panel */}
            {state.runId && (
              <section className="surface" aria-labelledby="artifacts-heading">
                <div className="p-5 border-b border-rule/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h2 id="artifacts-heading" className="font-semibold flex items-center gap-2">
                    <svg className="w-5 h-5 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Artifacts for Run #{state.runId}
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap">
                    {state.runStatus && (
                      <span className={`badge ${
                        state.runStatus === "completed" ? "badge-ok" :
                        state.runStatus === "in_progress" ? "badge-running" :
                        state.runStatus === "queued" ? "badge-queued" : "badge"
                      }`}>
                        {state.runStatus === "in_progress" ? "Running" :
                         state.runStatus === "queued" ? "Queued" :
                         state.runStatus === "completed" ? "Completed" : state.runStatus}
                      </span>
                    )}
                    {state.runConclusion && state.runStatus === "completed" && (
                      <span className={`badge ${state.runConclusion === "success" ? "badge-ok" : "badge-failed"}`}>
                        {state.runConclusion}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  {state.loading ? (
                    <div className="flex items-center justify-center gap-3 py-12">
                      <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
                      </svg>
                      <span className="text-[fg-muted]">Loading artifacts...</span>
                    </div>
                  ) : state.artifacts.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-rule/50 rounded-xl">
                      <svg className="mx-auto h-12 w-12 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="mt-3 text-[fg-muted]">No artifacts yet</p>
                      {state.runStatus === "in_progress" && (
                        <p className="text-[12px] text-[fg-muted] mt-1">Run in progress — artifacts appear when complete</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {state.artifacts.map((art, i) => (
                        <ArtifactCard key={art.name} artifact={art} index={i} />
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => state.runId && loadArtifacts(state.runId)}
                      className="btn-primary flex-1"
                      disabled={state.loading}
                    >
                      {state.loading ? "Refreshing..." : "Refresh Artifacts"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Enhancement Card */}
            <section className="stagger-in" style={{ animationDelay: "160ms" }}>
              <EnhancementCard
                enhanced={state.enhanced}
                onEnhance={enhanceScripts}
                loading={state.loading}
                stage={state.enhancementStage}
                logLines={state.enhancementLog}
                diff={state.enhancementDiff}
              />
            </section>
          </div>
        </div>

        {/* Configuration Summary - Mobile only */}
        <div className="lg:hidden mt-6 stagger-in" style={{ animationDelay: "240ms" }}>
          <section className="surface p-5" aria-labelledby="config-heading">
            <h2 id="config-heading" className="font-semibold mb-4">Current Configuration</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[fg-muted]">Aspect Ratio</dt>
                <dd className="font-medium">{currentAspect === "long-form" ? "Long Form (16:9)" : "Shorts (9:16)"}</dd>
              </div>
              <div>
                <dt className="text-[fg-muted]">Enhancement</dt>
                <dd className="font-medium">{state.enhanced ? "Active" : "Available"}</dd>
              </div>
              <div>
                <dt className="text-[fg-muted]">Selected Run</dt>
                <dd className="font-medium">{state.runId ? `#${state.runId}` : "None"}</dd>
              </div>
              <div>
                <dt className="text-[fg-muted]">Artifacts</dt>
                <dd className="font-medium">{state.artifacts.length}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* Desktop Config Summary - Fixed bottom */}
      <div className="hidden lg:fixed lg:bottom-0 lg:left-0 lg:right-0 lg:mx-auto lg:max-w-7xl lg:px-6 lg:py-4 lg:border-t lg:border-rule/50 lg:bg-bg/90 lg:backdrop-blur-lg stagger-in" style={{ animationDelay: "320ms" }}>
        <dl className="grid grid-cols-6 gap-4 text-sm">
          <div>
            <dt className="text-[fg-muted]">Aspect</dt>
            <dd className="font-medium">{currentAspect === "long-form" ? "16:9" : "9:16"}</dd>
          </div>
          <div>
            <dt className="text-[fg-muted]">Enhancement</dt>
            <dd className="font-medium">{state.enhanced ? "Active" : "Available"}</dd>
          </div>
          <div>
            <dt className="text-[fg-muted]">Run</dt>
            <dd className="font-medium">{state.runId ? `#${state.runId}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[fg-muted]">Status</dt>
            <dd className="font-medium">{state.runStatus || "—"}</dd>
          </div>
          <div>
            <dt className="text-[fg-muted]">Artifacts</dt>
            <dd className="font-medium">{state.artifacts.length}</dd>
          </div>
          <div>
            <dt className="text-[fg-muted]">History</dt>
            <dd className="font-medium">{state.runs.length} runs</dd>
          </div>
        </dl>
      </div>
    </main>
    </ErrorBoundary>
  );
}
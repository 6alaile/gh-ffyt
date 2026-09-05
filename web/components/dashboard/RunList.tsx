"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";

interface Run {
  id: number;
  created_at: string;
  html_url: string;
  status: "completed" | "in_progress" | "queued" | "failure" | "cancelled";
  conclusion: "success" | "failure" | "cancelled" | "neutral" | "skipped" | "timed_out" | "action_required" | null;
}

interface Artifact {
  name: string;
  url: string;
  type: "mp4" | "srt" | "json" | "log";
  size?: number;
}

interface RunDetail extends Run {
  artifacts: Artifact[];
  logs?: string;
}

interface RunListProps {
  runs: Run[];
  selectedRun: Run | null;
  onSelectRun: (run: Run) => void;
  onLoadArtifacts: (runId: number) => Promise<void>;
  loading: boolean;
  runStatus: string | null;
  runConclusion: string | null;
  artifacts: Artifact[];
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getStatusConfig(status: Run["status"], conclusion: Run["conclusion"]) {
  const isRunning = status === "in_progress" || status === "queued";
  const isComplete = status === "completed";

  if (isRunning) {
    return {
      label: status === "in_progress" ? "Running" : "Queued",
      className: "badge-running",
      pulse: true,
    };
  }

  if (isComplete) {
    if (conclusion === "success") {
      return { label: "Success", className: "badge-ok", pulse: false };
    }
    if (conclusion === "failure") {
      return { label: "Failed", className: "badge-failed", pulse: false };
    }
    return { label: "Completed", className: "badge-ok", pulse: false };
  }

  return { label: status, className: "badge", pulse: false };
}

export function RunList({
  runs,
  selectedRun,
  onSelectRun,
  onLoadArtifacts,
  loading,
  runStatus,
  runConclusion,
  artifacts,
}: RunListProps) {
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [liveStatus, setLiveStatus] = useState<Record<number, { status: string; progress: number }>>({});
  const eventSourceRef = useRef<Map<number, EventSource>>(new Map());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // SSE connection for real-time updates
  useEffect(() => {
    const runningRuns = runs.filter(r => r.status === "in_progress" || r.status === "queued");
    if (runningRuns.length === 0) return;

    // Try SSE for each running run
    for (const run of runningRuns) {
      const es = new EventSource(`/api/status/stream?run_id=${run.id}`);
      eventSourceRef.current.set(run.id, es);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.debug("SSE error for run", run.id, data.error);
            return;
          }
          setLiveStatus(prev => ({
            ...prev,
            [run.id]: { status: data.status, progress: data.progress || 0 }
          }));

          if (data.status === "completed") {
            es.close();
            eventSourceRef.current.delete(run.id);
            // Trigger artifact reload for selected run
            if (selectedRun?.id === run.id) {
              onLoadArtifacts(run.id);
            }
          }
        } catch (e) {
          console.debug("SSE parse error", e);
        }
      };

      es.onerror = () => {
        console.debug("SSE connection error for run", run.id, "falling back to polling");
        es.close();
        eventSourceRef.current.delete(run.id);
        // Start polling fallback for this run
        startPollingForRun(run.id);
      };
    }

    // Polling fallback
    const pollIntervals = new Map<number, NodeJS.Timeout>();

    const startPollingForRun = (runId: number) => {
      if (pollIntervals.has(runId)) return;
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status?run_id=${runId}`);
          if (res.ok) {
            const data = await res.json();
            setLiveStatus(prev => ({
              ...prev,
              [runId]: { status: data.status, progress: data.progress || 0 }
            }));
            if (data.status === "completed") {
              clearInterval(pollIntervals.get(runId));
              pollIntervals.delete(runId);
              if (selectedRun?.id === runId) {
                onLoadArtifacts(runId);
              }
            }
          }
        } catch (e) {
          console.debug("Polling failed for run", runId);
        }
      }, 5000);
      pollIntervals.set(runId, interval);
    };

    // Cleanup
    return () => {
      eventSourceRef.current.forEach(es => es.close());
      eventSourceRef.current.clear();
      pollIntervals.forEach(interval => clearInterval(interval));
      pollIntervals.clear();
    };
  }, [runs, selectedRun?.id, onLoadArtifacts]);

  // Animate row entrance
  useEffect(() => {
    const rows = Array.from(rowRefs.current.values());
    gsap.from(rows, {
      y: 20,
      opacity: 0,
      duration: 0.4,
      stagger: 0.06,
      ease: "power3.out",
    });
  }, [runs.length]);

  const handleRowClick = (run: Run) => {
    onSelectRun(run);
    onLoadArtifacts(run.id);
    setExpandedRunId(selectedRun?.id === run.id ? null : run.id);
  };

  if (loading && runs.length === 0) {
    return (
      <div className="surface p-8 text-center" role="status" aria-live="polite">
        <div className="inline-flex items-center gap-3 text-[fg-muted]">
          <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
          </svg>
          <span>Loading pipeline runs...</span>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="surface p-12 text-center border-2 border-dashed border-rule/50">
        <svg className="mx-auto h-14 w-14 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h3 className="mt-4 text-lg font-medium">No pipeline runs yet</h3>
        <p className="mt-1 text-[fg-muted]">Create a brief to start your first render</p>
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden" role="list" aria-label="Pipeline runs">
      <div className="p-4 border-b border-rule/50 flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-[fg-muted]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 002-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Recent Runs
        </h2>
        <span className="badge">{runs.length} total</span>
      </div>

      <div className="divide-y divide-rule/50 max-h-[500px] overflow-y-auto scrollbar-thin">
        {runs.slice(0, 20).map((run, index) => {
          const isSelected = selectedRun?.id === run.id;
          const isExpanded = expandedRunId === run.id;
          const statusConfig = getStatusConfig(run.status, run.conclusion);
          const liveData = liveStatus[run.id];
          const displayStatus = liveData?.status || run.status;
          const liveConfig = getStatusConfig(displayStatus as Run["status"], run.conclusion);

          return (
            <div
              key={run.id}
              ref={(el) => { if (el) rowRefs.current.set(run.id, el); }}
              role="listitem"
              onClick={() => handleRowClick(run)}
              className={`
                p-4 transition-all duration-fast ease-out-expo cursor-pointer
                ${isSelected ? "bg-[accent-soft] border-l-4 border-accent" : "hover:bg-[bg-hover]"}
                ${isExpanded ? "bg-[accent-soft]/50" : ""}
              `}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(run); } }}
              style={{ willChange: "background-color, border-color" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status indicator */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`
                        w-2.5 h-2.5 rounded-full transition-all duration-300
                        ${liveConfig.className.replace("badge", "").replace("animate-pulse", "")}
                        ${liveConfig.pulse ? "animate-pulse" : ""}
                      `}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[12px] text-[fg-muted]">#{run.id}</span>
                  </div>

                  {/* Time & status */}
                  <div className="flex items-center gap-3">
                    <time className="text-[13px] text-[fg-muted] whitespace-nowrap" dateTime={run.created_at}>
                      {formatRelativeTime(run.created_at)}
                    </time>
                    <span
                      className={`
                        ${liveConfig.className}
                        ${liveConfig.pulse ? "animate-pulse" : ""}
                        transition-all duration-300
                      `}
                      aria-live="polite"
                    >
                      {liveConfig.label}
                    </span>
                  </div>
                </div>

                {/* Chevron / Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {run.status === "completed" && run.conclusion === "success" && artifacts.length > 0 && (
                    <span className="badge badge-ok text-[10px]">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {artifacts.length} artifacts
                    </span>
                  )}
                  <svg
                    className={`
                      w-5 h-5 text-[fg-muted] transition-transform duration-300 ease-out-expo
                      ${isExpanded ? "rotate-180" : ""}
                    `}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded detail row */}
              {isExpanded && (
                <div
                  className="mt-4 pt-4 border-t border-rule/50 animate-in"
                  style={{ animationDelay: "0ms" }}
                  role="region"
                  aria-label={`Run ${run.id} details`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[fg-muted] mb-1">Status</p>
                      <p className="font-mono capitalize">{displayStatus}</p>
                    </div>
                    <div>
                      <p className="text-[fg-muted] mb-1">Conclusion</p>
                      <p className="font-mono capitalize">{run.conclusion || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[fg-muted] mb-1">Created</p>
                      <p className="font-mono">{new Date(run.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  {liveData && liveData.progress !== undefined && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[12px] text-[fg-muted] mb-1">
                        <span>Progress</span>
                        <span>{Math.round(liveData.progress)}%</span>
                      </div>
                      <div className="h-1.5 bg-[bg-hover] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all duration-500 ease-out-expo"
                          style={{ width: `${liveData.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.827 12.69l-7.5 7.5M13.827 12.69l-7.5-7.5M13.827 12.69h10.5" />
                      </svg>
                      View on GitHub
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {runs.length > 20 && (
        <div className="p-4 border-t border-rule/50 text-center">
          <p className="text-[fg-muted] text-sm">Showing 20 of {runs.length} runs</p>
        </div>
      )}
    </div>
  );
}
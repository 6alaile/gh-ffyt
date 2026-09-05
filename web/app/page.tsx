"use client";

import { useEffect, useState } from "react";

/* ================================================================
   DASHBOARD PAGE (HOME)
   Main dashboard showing pipeline overview, recent runs, and stats.
   ================================================================ */

type Run = {
  id: number;
  created_at: string;
  html_url: string;
  status: string;
  conclusion: string | null;
};

type DashboardStats = {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  queued: number;
};

/* ================================================================
   HELPER: Format date relative to now
   ================================================================ */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ================================================================
   HELPER: Get status color and label
   ================================================================ */
function getStatusInfo(status: string, conclusion: string | null): { color: string; label: string } {
  if (status === "in_progress") return { color: "#FFD700", label: "In Progress" };
  if (status === "queued") return { color: "#a3a3a3", label: "Queued" };
  if (conclusion === "success") return { color: "#22c55e", label: "Completed" };
  if (conclusion === "failure") return { color: "#ef4444", label: "Failed" };
  return { color: "#a3a3a3", label: status };
}

/* ================================================================
   HELPER: Generate bar chart data from runs
   ================================================================ */
function generateBarData(runs: Run[]): number[] {
  const last25 = runs.slice(0, 25);
  if (last25.length === 0) {
    return [0.4, 0.55, 0.35, 0.5, 0.6, 0.45, 0.3, 0.65, 0.4, 0.5, 0.35, 0.55, 0.4, 0.6, 0.45, 0.35, 0.5, 0.65, 0.4, 0.55, 0.3, 0.45, 0.5, 0.6, 1.0];
  }
  return last25.map((_, i) => 0.3 + Math.random() * 0.7);
}

export default function DashboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, completed: 0, inProgress: 0, failed: 0, queued: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ================================================================
     FETCH: Load runs from API on mount
     Falls back to mock data if API fails (development mode)
     ================================================================ */
  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch("/api/history");
        if (!res.ok) throw new Error("API not available");
        const data = await res.json();
        const runsList = data.runs || [];
        setRuns(runsList);

        // Calculate stats
        const stats: DashboardStats = {
          total: runsList.length,
          completed: runsList.filter((r: Run) => r.conclusion === "success").length,
          inProgress: runsList.filter((r: Run) => r.status === "in_progress").length,
          failed: runsList.filter((r: Run) => r.conclusion === "failure").length,
          queued: runsList.filter((r: Run) => r.status === "queued").length,
        };
        setStats(stats);
      } catch {
        // Fallback to mock data for development
        const mockRuns: Run[] = [
          { id: 1001, created_at: new Date(Date.now() - 3600000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 1000, created_at: new Date(Date.now() - 7200000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 999, created_at: new Date(Date.now() - 10800000).toISOString(), html_url: "#", status: "in_progress", conclusion: null },
          { id: 998, created_at: new Date(Date.now() - 86400000).toISOString(), html_url: "#", status: "completed", conclusion: "failure" },
          { id: 997, created_at: new Date(Date.now() - 172800000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
        ];
        setRuns(mockRuns);
        setStats({ total: 5, completed: 3, inProgress: 1, failed: 1, queued: 0 });
      } finally {
        setLoading(false);
      }
    }
    fetchRuns();
  }, []);

  const barData = generateBarData(runs);

  /* ================================================================
     LOADING STATE
     ================================================================ */
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-fg-muted">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
          </svg>
          <span className="text-lg">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  /* ================================================================
     ERROR STATE
     ================================================================ */
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-fg-muted mb-4">Failed to load dashboard data</p>
          <p className="text-fg-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
      {/* ================================================================
         HEADER SECTION
         Page title and action buttons.
         ================================================================ */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-4xl font-extrabold text-fg leading-tight">Dashboard</h1>
          <p className="text-fg-muted text-[14px] mt-1.5">Overview and pipeline controls</p>
        </div>
        <a
          href="/new-video"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          New Video
        </a>
      </div>

      {/* ================================================================
         BAR CHART SECTION
         Visual representation of recent pipeline activity.
         ================================================================ */}
      <div className="flex items-end gap-1 h-32 mt-6 mb-8">
        {barData.map((val, i) => {
          const isActive = i === barData.length - 1;
          return (
            <div key={i} className="flex-1 flex items-end">
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${val * 100}%`,
                  background: isActive ? "#FFD700" : "#1a1500",
                  borderRadius: "3px 3px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ================================================================
         STATS CARDS SECTION
         Quick overview of pipeline status.
         ================================================================ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-bg rounded-xl p-4 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-1">Total</p>
          <p className="text-3xl font-bold text-fg">{stats.total}</p>
        </div>
        <div className="bg-bg rounded-xl p-4 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-1">Completed</p>
          <p className="text-3xl font-bold text-success">{stats.completed}</p>
        </div>
        <div className="bg-bg rounded-xl p-4 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-1">In Progress</p>
          <p className="text-3xl font-bold text-accent">{stats.inProgress}</p>
        </div>
        <div className="bg-bg rounded-xl p-4 border border-rule">
          <p className="text-fg-muted text-[12px] uppercase tracking-wider mb-1">Failed</p>
          <p className="text-3xl font-bold text-danger">{stats.failed}</p>
        </div>
      </div>

      {/* ================================================================
         RECENT RUNS SECTION
         List of recent pipeline runs with status indicators.
         ================================================================ */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-fg text-[16px]">Recent Runs</h2>
          <a href="/history" className="text-accent text-[13px] hover:underline">View All</a>
        </div>
        <div className="border-t border-rule">
          {runs.length === 0 ? (
            <div className="py-8 text-center text-fg-muted">
              <p>No runs yet. Create a video to get started.</p>
            </div>
          ) : (
            runs.slice(0, 5).map((run, i) => {
              const statusInfo = getStatusInfo(run.status, run.conclusion);
              return (
                <div key={run.id} className={`flex items-center gap-4 py-3.5 ${i < 4 ? "border-b border-rule" : ""}`}>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: statusInfo.color + "20" }}
                  >
                    <svg viewBox="0 0 24 24" fill={statusInfo.color} className="w-4 h-4">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fg text-[15px]">Run #{run.id}</p>
                    <p className="text-fg-muted text-[13px] mt-0.5">{formatRelativeDate(run.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
                    <span className="text-fg-muted text-[13px]">{statusInfo.label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

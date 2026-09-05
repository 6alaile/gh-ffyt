"use client";

import { useEffect, useState } from "react";

/* ================================================================
   HISTORY PAGE
   Displays complete render history with filtering and search.
   ================================================================ */

type Run = {
  id: number;
  created_at: string;
  html_url: string;
  status: string;
  conclusion: string | null;
};

type FilterStatus = "all" | "completed" | "in_progress" | "failed" | "queued";

/* ================================================================
   HELPER: Format date
   ================================================================ */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

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
        setRuns(data.runs || []);
      } catch {
        // Fallback to mock data for development
        const mockRuns: Run[] = [
          { id: 1001, created_at: new Date(Date.now() - 3600000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 1000, created_at: new Date(Date.now() - 7200000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 999, created_at: new Date(Date.now() - 10800000).toISOString(), html_url: "#", status: "in_progress", conclusion: null },
          { id: 998, created_at: new Date(Date.now() - 86400000).toISOString(), html_url: "#", status: "completed", conclusion: "failure" },
          { id: 997, created_at: new Date(Date.now() - 172800000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 996, created_at: new Date(Date.now() - 259200000).toISOString(), html_url: "#", status: "completed", conclusion: "success" },
          { id: 995, created_at: new Date(Date.now() - 345600000).toISOString(), html_url: "#", status: "queued", conclusion: null },
        ];
        setRuns(mockRuns);
      } finally {
        setLoading(false);
      }
    }
    fetchRuns();
  }, []);

  /* ================================================================
     FILTER: Apply status filter and search
     ================================================================ */
  const filteredRuns = runs.filter((run) => {
    // Status filter
    if (filter !== "all") {
      if (filter === "completed" && run.conclusion !== "success") return false;
      if (filter === "failed" && run.conclusion !== "failure") return false;
      if (filter === "in_progress" && run.status !== "in_progress") return false;
      if (filter === "queued" && run.status !== "queued") return false;
    }
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      return run.id.toString().includes(searchLower);
    }
    return true;
  });

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
          <span className="text-lg">Loading History...</span>
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
          <p className="text-fg-muted mb-4">Failed to load history</p>
          <p className="text-fg-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
      {/* ================================================================
         HEADER SECTION
         Page title and search input.
         ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-extrabold text-fg leading-tight">History</h1>
          <p className="text-fg-muted text-[14px] mt-1.5">Complete render history</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search runs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none w-full sm:w-64"
          />
        </div>
      </div>

      {/* ================================================================
         FILTER TABS SECTION
         Status filter tabs for runs.
         ================================================================ */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", "completed", "in_progress", "failed", "queued"] as FilterStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === status
                ? "bg-accent text-bg"
                : "bg-bg border border-rule text-fg-muted hover:text-fg hover:border-accent/50"
            }`}
          >
            {status === "all" ? "All" : status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* ================================================================
         RUNS TABLE SECTION
         Table displaying filtered runs with actions.
         ================================================================ */}
      <div className="bg-bg rounded-xl border border-rule overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-bg-elevated border-b border-rule text-fg-muted text-[12px] uppercase tracking-wider font-semibold">
          <div className="col-span-2">Run ID</div>
          <div className="col-span-3">Date</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Conclusion</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {/* Table Body */}
        {filteredRuns.length === 0 ? (
          <div className="py-12 text-center text-fg-muted">
            <p>No runs found</p>
          </div>
        ) : (
          filteredRuns.map((run, i) => {
            const statusInfo = getStatusInfo(run.status, run.conclusion);
            return (
              <div
                key={run.id}
                className={`grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-bg-elevated/50 transition-colors ${
                  i < filteredRuns.length - 1 ? "border-b border-rule" : ""
                }`}
              >
                <div className="col-span-2">
                  <span className="font-mono text-fg">#{run.id}</span>
                </div>
                <div className="col-span-3 text-fg-muted text-[14px]">
                  {formatDate(run.created_at)}
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
                    <span className="text-fg text-[14px]">{statusInfo.label}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-fg-muted text-[14px] capitalize">
                    {run.conclusion || "—"}
                  </span>
                </div>
                <div className="col-span-3 flex justify-end gap-2">
                  <a
                    href={run.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-[12px] font-medium text-fg-muted bg-bg border border-rule rounded-lg hover:text-fg hover:border-accent/50 transition-colors"
                  >
                    View on GitHub
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

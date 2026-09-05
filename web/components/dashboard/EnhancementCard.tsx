"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

type EnhancementStage = "idle" | "processing" | "complete" | "error";

interface EnhancementCardProps {
  enhanced: boolean;
  onEnhance: () => Promise<void>;
  loading: boolean;
  stage?: EnhancementStage;
  logLines?: string[];
  diff?: { before: string; after: string }[];
}

export function EnhancementCard({ enhanced, onEnhance, loading, stage = "idle", logLines = [], diff = [] }: EnhancementCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [showDiff, setShowDiff] = useState(false);

  // Animate card entrance
  useEffect(() => {
    if (cardRef.current) {
      gsap.from(cardRef.current, {
        y: 24,
        opacity: 0,
        duration: 0.6,
        delay: 0.2,
        ease: "power3.out",
      });
    }
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current && stage === "processing") {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines, stage]);

  const handleEnhance = async () => {
    if (loading) return;
    await onEnhance();
  };

  if (stage === "processing") {
    return (
      <div ref={cardRef} className="surface p-6" role="status" aria-live="polite" aria-label="Script enhancement in progress">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M12 3a9 9 0 100 18M12 3a9 9 0 110 18" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Enhancing Scripts...</h3>
              <p className="text-[13px] text-[fg-muted]">AI script writer adding emphasis, timings & CTA notes</p>
            </div>
          </div>
          <span className="badge badge-running">Processing</span>
        </div>

        {/* Progress log */}
        <div
          ref={logRef}
          className="bg-[bg-hover] border border-rule/50 rounded-lg p-4 font-mono text-[12px] text-[fg-muted] max-h-64 overflow-y-auto scrollbar-thin"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
          aria-live="polite"
          aria-label="Enhancement log"
        >
          {logLines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[fg-muted]">
              <svg className="animate-spin h-6 w-6 text-accent mr-2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
              </svg>
              <span>Initializing script writer...</span>
            </div>
          ) : (
            logLines.map((line, i) => (
              <div key={i} className="py-0.5 border-l-2 border-accent/30 pl-3 animate-in" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="text-[fg-muted]">{new Date().toLocaleTimeString()}</span>
                <span className="mx-2 text-rule">›</span>
                <span>{line}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 text-[13px] text-[fg-muted]">
          <svg className="animate-spin h-4 w-4 text-accent" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
          </svg>
          <span>This usually takes 10-30 seconds...</span>
        </div>
      </div>
    );
  }

  if (stage === "complete" && diff.length > 0) {
    return (
      <div ref={cardRef} className="surface p-6" role="region" aria-label="Enhancement complete with diff">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Enhancement Complete</h3>
              <p className="text-[13px] text-[fg-muted]">{diff.length} scene(s) enhanced with emphasis & timings</p>
            </div>
          </div>
          <span className="badge badge-ok">Complete</span>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`btn-ghost text-sm ${showDiff ? "bg-[accent-soft] border-accent/50 text-accent" : ""}`}
            aria-pressed={showDiff}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {showDiff ? "Hide Diff" : "Show Diff"}
          </button>
          <span className="text-[13px] text-[fg-muted]">{diff.length} changes</span>
        </div>

        {showDiff && (
          <div className="border border-rule/50 rounded-lg overflow-hidden animate-in">
            {diff.map((d, i) => (
              <div key={i} className="border-t border-rule/30">
                <div className="p-3 bg-red-500/5 border-b border-rule/30">
                  <p className="font-mono text-[11px] text-red-300">− Before</p>
                  <pre className="font-mono text-[12px] text-[fg-muted] whitespace-pre-wrap mt-1">{d.before}</pre>
                </div>
                <div className="p-3 bg-success/5">
                  <p className="font-mono text-[11px] text-success">+ After</p>
                  <pre className="font-mono text-[12px] text-fg whitespace-pre-wrap mt-1">{d.after}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div ref={cardRef} className="surface p-6 border-danger/30" role="alert">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-danger/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" strokeLinecap="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-lg">Enhancement Failed</h3>
            <p className="text-[13px] text-[fg-muted]">Fell back to rule-based templates. Check logs for details.</p>
          </div>
        </div>
        <button onClick={handleEnhance} className="btn-primary mt-4" disabled={loading}>
          Retry
        </button>
      </div>
    );
  }

  // Idle / enhanced state
  return (
    <div ref={cardRef} className="surface p-6" role="region" aria-label={enhanced ? "Scripts enhanced" : "Script enhancement available"}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
            ${enhanced ? "bg-success/20 text-success" : "bg-[bg-hover] text-[fg-muted]"}
          `}>
            {enhanced ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-lg">AI Script Enhancement</h3>
            <p className="text-[13px] text-[fg-muted]">
              {enhanced
                ? "Scripts enriched with emphasis, word timings & CTA notes"
                : "Add narrative emphasis, word-level timings, and CTA notes to all scenes"}
            </p>
          </div>
        </div>
        <span className={enhanced ? "badge badge-ok" : "badge"}>
          {enhanced ? "Enhanced" : "Available"}
        </span>
      </div>

      {!enhanced && (
        <button
          onClick={handleEnhance}
          className="btn-primary w-full"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Enhancing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Enhance Scripts
            </>
          )}
        </button>
      )}

      {enhanced && (
        <div className="mt-4 p-4 bg-[accent-soft] rounded-lg border border-accent/30">
          <p className="text-sm text-accent font-mono">Ready for render with enhanced scripts</p>
          <p className="text-[12px] text-[fg-muted] mt-1">Uses: Omniroute → Gemini → OpenRouter → Rule-based fallback</p>
        </div>
      )}
    </div>
  );
}
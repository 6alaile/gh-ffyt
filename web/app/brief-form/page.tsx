"use client";

import { useEffect, useRef, useState } from "react";

type FormData = {
  matchTitle: string;
  teams: string;
  keyMoments: string;
  analysisAngle: string;
  tone: string;
  cta: string;
};

type BriefMode = "quick" | "research" | "topic-only";

type DispatchState =
  | { step: "form" }
  | { step: "review"; markdown: string; briefId: string }
  | { step: "submitting"; message: string }
  | { step: "dispatched"; uploadPath: string; actionsUrl: string }
  | { step: "error"; message: string };

export default function BriefFormPage() {
  const [mode, setMode] = useState<BriefMode>("research");
  const [formData, setFormData] = useState<FormData>({
    matchTitle: "",
    teams: "",
    keyMoments: "",
    analysisAngle: "defensive-collapse",
    tone: "analytical",
    cta: "",
  });

  const [dispatchState, setDispatchState] = useState<DispatchState>({ step: "form" });
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API if supported in browser
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          setFormData((prev) => ({
            ...prev,
            keyMoments: prev.keyMoments
              ? `${prev.keyMoments}\n${currentTranscript}`
              : currentTranscript,
          }));
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition error:", event.error);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Web Speech API is not supported in this browser. Please type directly into the fields.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  };

  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatchState({ step: "submitting", message: "Generating brief..." });

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          formData,
          transcript,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${res.statusText}`);
      }

      const data = await res.json();
      setDispatchState({
        step: "review",
        markdown: data.markdown,
        briefId: data.briefId,
      });
    } catch (err: any) {
      setDispatchState({
        step: "error",
        message: err.message || "Failed to generate brief.",
      });
    }
  };

  const handleApproveAndRender = async (markdownText: string) => {
    setDispatchState({ step: "submitting", message: "Committing brief to GitHub..." });

    try {
      const safeTitle = (formData.matchTitle || "brief").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const file = new File([markdownText], `${safeTitle}.md`, { type: "text/markdown" });

      const fd = new FormData();
      fd.append("brief", file);

      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(`Upload failed: ${err.error || upRes.statusText}`);
      }
      const upload = await upRes.json();

      setDispatchState({ step: "submitting", message: "Triggering GitHub Actions render workflow..." });
      const renderRes = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: upload.id, briefPath: upload.path }),
      });

      if (!renderRes.ok) {
        const err = await renderRes.json().catch(() => ({}));
        throw new Error(`Render dispatch failed: ${err.error || renderRes.statusText}`);
      }

      const renderData = await renderRes.json();
      setDispatchState({
        step: "dispatched",
        uploadPath: upload.path,
        actionsUrl: renderData.actionsUrl || "https://github.com/",
      });
    } catch (err: any) {
      setDispatchState({
        step: "error",
        message: err.message || "Failed to submit brief to pipeline.",
      });
    }
  };

  if (dispatchState.step === "review") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Review & Edit Brief</h1>
          <p className="mt-2 text-muted">
            Inspect the generated Markdown brief below. Edit any scenes or details, then click approve to dispatch the render pipeline.
          </p>
        </header>

        <section className="card mb-8">
          <textarea
            value={dispatchState.markdown}
            onChange={(e) =>
              setDispatchState({
                ...dispatchState,
                markdown: e.target.value,
              })
            }
            className="w-full rounded-md border border-border bg-bg p-4 font-mono text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent"
            rows={24}
          />
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => handleApproveAndRender(dispatchState.markdown)}
              className="btn-primary flex-1"
            >
              Approve & Dispatch Render Pipeline →
            </button>
            <button
              onClick={() => setDispatchState({ step: "form" })}
              className="btn-ghost"
            >
              Back to Form
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (dispatchState.step === "submitting") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <section className="card text-center py-12">
          <h2 className="text-xl font-semibold mb-3">Processing...</h2>
          <p className="text-muted">{dispatchState.message}</p>
        </section>
      </main>
    );
  }

  if (dispatchState.step === "dispatched") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <section className="card border-accent text-center py-12">
          <span className="badge-ok mb-4 inline-block">Workflow Dispatched</span>
          <h2 className="text-2xl font-semibold mb-3">Render Pipeline Started!</h2>
          <p className="text-muted mb-6">
            Committed brief to <code className="text-accent">{dispatchState.uploadPath}</code> and triggered GitHub Actions.
          </p>
          <div className="flex justify-center gap-4">
            <a
              href={dispatchState.actionsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              View GitHub Actions Run →
            </a>
            <button
              onClick={() => setDispatchState({ step: "form" })}
              className="btn-ghost"
            >
              Create Another Br
ief
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Brief Creator</h1>
        <p className="mt-2 text-muted">
          Describe the match you just watched. We will generate a structured brief, let you review it, and trigger the video render pipeline on GitHub Actions.
        </p>
      </header>

      {dispatchState.step === "error" && (
        <section className="card mb-8 border-danger">
          <h2 className="text-lg font-semibold text-danger mb-2">Error</h2>
          <p className="text-sm">{dispatchState.message}</p>
          <button
            onClick={() => setDispatchState({ step: "form" })}
            className="btn-ghost mt-4"
          >
            Try Again
          </button>
        </section>
      )}

      {/* Mode Selection */}
      <section className="card mb-8">
        <h2 className="text-lg font-semibold mb-3">1. Pipeline Mode</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={`p-3 rounded-lg border text-left transition ${
              mode === "quick" ? "border-accent bg-accent/10" : "border-border hover:border-muted"
            }`}
          >
            <div className="font-semibold text-sm">Quick Brief</div>
            <div className="text-xs text-muted mt-1">Directly format form inputs</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("research")}
            className={`p-3 rounded-lg border text-left transition ${
              mode === "research" ? "border-accent bg-accent/10" : "border-border hover:border-muted"
            }`}
          >
            <div className="font-semibold text-sm">Research-Enhanced</div>
            <div className="text-xs text-muted mt-1">Enrich inputs with tactical context</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("topic-only")}
            className={`p-3 rounded-lg border text-left transition ${
              mode === "topic-only" ? "border-accent bg-accent/10" : "border-border hover:border-muted"
            }`}
          >
            <div className="font-semibold text-sm">Topic-Only</div>
            <div className="text-xs text-muted mt-1">Full automated synthesis</div>
          </button>
        </div>
      </section>

      {/* Voice Input */}
      <section className="card mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">2. Voice Input (Optional)</h2>
          {speechSupported ? (
            <span className="text-xs text-accent">Web Speech Enabled</span>
          ) : (
            <span className="text-xs text-muted">Browser Microphone Supported</span>
          )}
        </div>
        <p className="text-sm text-muted mb-4">
          Click record and speak your observations. Speech will transcribe live into the key moments field.
        </p>
        <button
          type="button"
          onClick={toggleRecording}
          className={isRecording ? "btn-ghost text-red-500 border-red-500" : "btn-primary"}
        >
          {isRecording ? "Stop Recording (Listening...)" : "Start Voice Recording"}
        </button>
      </section>

      {/* Form Fields */}
      <section className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">3. Match Details</h2>
        <form onSubmit={handleGenerateBrief} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Match Title</label>
            <input
              type="text"
              placeholder="e.g. Opening Day shock"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm"
              value={formData.matchTitle}
              onChange={(e) => setFormData({ ...formData, matchTitle: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Teams Involved</label>
            <input
              type="text"
              placeholder="e.g. Hull City, Manchester United"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm"
              value={formData.teams}
              onChange={(e) => setFormData({ ...formData, teams: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Key Moments</label>
            <textarea
              rows={4}
              placeholder="e.g. United conceded 2 goals in the first half, never looked like scoring."
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm resize-y"
              value={formData.keyMoments}
              onChange={(e) => setFormData({ ...formData, keyMoments: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Analysis Angle</label>
              <select
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm"
                value={formData.analysisAngle}
                onChange={(e) => setFormData({ ...formData, analysisAngle: e.target.value })}
              >
                <option value="defensive-collapse">Defensive collapse</option>
                <option value="high-line-exposed">High line exposed</option>
                <option value="title-implications">Title race implications</option>
                <option value="player-performance">Individual player performance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tone</label>
              <select
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm"
                value={formData.tone}
                onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
              >
                <option value="analytical">Analytical</option>
                <option value="energetic">Energetic</option>
                <option value="subdued">Subdued</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Call to Action (CTA)</label>
            <input
              type="text"
              placeholder="e.g. Will Hull stay up this season? Subscribe for more!"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm shadow-sm"
              value={formData.cta}
              onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full mt-6 py-3">
            Generate Brief for Review →
          </button>
        </form>
      </section>
    </main>
  );
}

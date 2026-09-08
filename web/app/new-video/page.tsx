"use client";

import { useEffect, useRef, useState } from "react";

/* ================================================================
   NEW VIDEO PAGE
   Form for creating a new video render request.
   ================================================================ */

type FormData = {
  matchTitle: string;
  teams: string;
  keyMoments: string;
  analysisAngle: string;
  tone: string;
  cta: string;
  aspectRatio: "16:9" | "9:16";
};

type BriefMode = "quick" | "research" | "topic-only" | "upload";

type DispatchState =
  | { step: "form" }
  | { step: "review"; markdown: string; briefId: string }
  | { step: "submitting"; message: string }
  | { step: "dispatched"; uploadPath: string; actionsUrl: string }
  | { step: "error"; message: string };

export default function NewVideoPage() {
  const [mode, setMode] = useState<BriefMode>("research");
  const [formData, setFormData] = useState<FormData>({
    matchTitle: "",
    teams: "",
    keyMoments: "",
    analysisAngle: "defensive-collapse",
    tone: "analytical",
    cta: "",
    aspectRatio: "16:9",
  });

  const [dispatchState, setDispatchState] = useState<DispatchState>({ step: "form" });
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMarkdown, setUploadMarkdown] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingMethod, setRecordingMethod] = useState<"web-speech" | "media-recorder" | null>(null);
  const [mediaRecorderSupported, setMediaRecorderSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /* ================================================================
     EFFECT: Initialize Web Speech API & MediaRecorder
     ================================================================ */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let finalTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            finalTranscript += event.results[i][0].transcript;
          }
          setTranscript(finalTranscript);
        };
        recognitionRef.current = recognition;
      }

      // Check MediaRecorder support (fallback for Firefox/Safari)
      if (
        navigator.mediaDevices &&
        "getUserMedia" in navigator.mediaDevices &&
        "MediaRecorder" in window
      ) {
        setMediaRecorderSupported(true);
      }
    }
  }, []);

  /* ================================================================
     EFFECT: Recording timer
     ================================================================ */
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((t) => {
          if (t >= 179) { // 180 second limit
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            setDispatchState({
              step: "error",
              message: "Recording limit reached (3 minutes max)",
            });
            return 0;
          }
          return t + 1;
        });
      }, 1000);
    } else {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [isRecording]);

  /* ================================================================
     HANDLER: Toggle voice recording
     ================================================================ */
  async function toggleRecording() {
    if (recordingMethod === "web-speech") {
      if (isRecording) {
        recognitionRef.current?.stop();
        setIsRecording(false);
      } else {
        recognitionRef.current?.start();
        setIsRecording(true);
      }
    } else if (recordingMethod === "media-recorder") {
      if (isRecording) {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
      } else {
        await startMediaRecording();
      }
    } else {
      // First click: detect which method to use
      if (speechSupported && recognitionRef.current) {
        setRecordingMethod("web-speech");
        recognitionRef.current.start();
        setIsRecording(true);
      } else if (mediaRecorderSupported) {
        setRecordingMethod("media-recorder");
        await startMediaRecording();
      } else {
        setDispatchState({
          step: "error",
          message: "Voice input not supported in this browser. Please type or paste content.",
        });
      }
    }
  }

  /* ================================================================
     HANDLER: Start MediaRecorder (Firefox/Safari fallback)
     ================================================================ */
  async function startMediaRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadAudioForTranscription(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
        setRecordingMethod(null);
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        setDispatchState({
          step: "error",
          message: "Recording error. Please try again.",
        });
        stream.getTracks().forEach((track) => track.stop());
        setRecordingMethod(null);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      const message =
        error instanceof Error && error.name === "NotAllowedError"
          ? "Microphone access denied. Please check browser permissions."
          : "Failed to start recording. Please try again.";
      setDispatchState({ step: "error", message });
      setRecordingMethod(null);
    }
  }

  /* ================================================================
     HANDLER: Upload audio for transcription (Whisper)
     ================================================================ */
  async function uploadAudioForTranscription(audioBlob: Blob) {
    setDispatchState({ step: "submitting", message: "Transcribing audio..." });

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Transcription failed");
      }

      const { transcript: transcribedText } = await response.json();
      setTranscript(transcribedText);
      setFormData((f) => ({ ...f, keyMoments: transcribedText }));
      setDispatchState({ step: "form" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transcription failed";
      setDispatchState({ step: "error", message });
    }
  }

  /* ================================================================
     HANDLER: Submit form
     Upload mode already has finished markdown (no server generation
     needed). Research/Quick/Topic Only hand raw form fields to
     /api/brief, which builds the markdown server-side (optionally
     LLM-enriched) — matching the contract /api/brief actually expects.
     ================================================================ */
  async function handleSubmit() {
    if (mode === "upload") {
      let markdown: string;
      if (uploadFile) {
        markdown = await uploadFile.text();
      } else if (uploadMarkdown.trim()) {
        markdown = uploadMarkdown;
      } else {
        setDispatchState({ step: "error", message: "Please upload a file or paste markdown content." });
        return;
      }
      setDispatchState({
        step: "review",
        markdown,
        briefId: `upload-${Date.now().toString(36)}`,
      });
      return;
    }

    setDispatchState({ step: "submitting", message: "Generating brief..." });

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, formData, transcript }),
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
    } catch (err) {
      setDispatchState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to generate brief",
      });
    }
  }

  /* ================================================================
     HANDLER: Dispatch render
     Commits the reviewed markdown to GitHub via /api/upload, then
     dispatches the render workflow with the resulting uploadId +
     briefPath — matching render-and-upload.yml's actual inputs.
     ================================================================ */
  async function handleDispatch() {
    if (dispatchState.step !== "review") return;

    setDispatchState({ step: "submitting", message: "Committing brief to GitHub..." });

    try {
      const safeTitle = (formData.matchTitle || "brief").toLowerCase().replace(/[^a-z0-9]/g, "_");
      const file = new File([dispatchState.markdown], `${safeTitle}.md`, { type: "text/markdown" });

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
    } catch (err) {
      setDispatchState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to dispatch render",
      });
    }
  }

  /* ================================================================
     HANDLER: Reset form
     ================================================================ */
  function handleReset() {
    setDispatchState({ step: "form" });
    setFormData({
      matchTitle: "",
      teams: "",
      keyMoments: "",
      analysisAngle: "defensive-collapse",
      tone: "analytical",
      cta: "",
      aspectRatio: "16:9",
    });
    setTranscript("");
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8" style={{ scrollbarWidth: "none" }}>
      {/* ================================================================
         HEADER SECTION
         Page title and mode selector.
         ================================================================ */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-fg leading-tight">New Video</h1>
        <p className="text-fg-muted text-[14px] mt-1.5">Create a new video render request</p>
      </div>

      {/* ================================================================
         FORM STEP
         Video creation form with mode selector.
         ================================================================ */}
      {dispatchState.step === "form" && (
        <>
          {/* Mode Selector */}
          <div className="flex flex-wrap gap-3 mb-6">
            {(["research", "quick", "topic-only", "upload"] as BriefMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-accent text-bg"
                    : "bg-bg border border-rule text-fg-muted hover:text-fg hover:border-accent/50"
                }`}
              >
                {m === "research" ? "Research" : m === "quick" ? "Quick" : m === "topic-only" ? "Topic Only" : "Upload Brief"}
              </button>
            ))}

            {/* Aspect Ratio Selector */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-fg-muted text-[13px]">Aspect:</span>
              <button
                onClick={() => setFormData((f) => ({ ...f, aspectRatio: "16:9" }))}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  formData.aspectRatio === "16:9"
                    ? "bg-accent text-bg"
                    : "bg-bg border border-rule text-fg-muted hover:text-fg"
                }`}
              >
                16:9
              </button>
              <button
                onClick={() => setFormData((f) => ({ ...f, aspectRatio: "9:16" }))}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  formData.aspectRatio === "9:16"
                    ? "bg-accent text-bg"
                    : "bg-bg border border-rule text-fg-muted hover:text-fg"
                }`}
              >
                9:16
              </button>
            </div>
          </div>

          {/* Upload Brief Mode */}
          {mode === "upload" ? (
            <div className="space-y-6">
              <div className="bg-bg rounded-xl border border-rule p-6">
                <h3 className="text-fg font-semibold text-[15px] mb-2">Upload Brief</h3>
                <p className="text-fg-muted text-[13px] mb-4">
                  Upload an existing markdown brief or paste content directly.
                </p>

                <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">
                  Upload File
                </label>
                <div className="flex items-center gap-4 mb-4">
                  <label className="flex-1 flex items-center justify-center px-4 py-8 bg-bg border border-dashed border-rule rounded-lg cursor-pointer hover:border-accent/50 transition-colors">
                    <input
                      type="file"
                      accept=".md,.txt,.markdown"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setUploadFile(file);
                        if (file) setUploadMarkdown("");
                      }}
                    />
                    <div className="text-center">
                      <svg className="w-8 h-8 text-fg-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                      </svg>
                      {uploadFile ? (
                        <span className="text-fg text-sm font-medium">{uploadFile.name}</span>
                      ) : (
                        <span className="text-fg-muted text-sm">Click to upload .md or .txt</span>
                      )}
                    </div>
                  </label>
                  {uploadFile && (
                    <button
                      onClick={() => setUploadFile(null)}
                      className="px-3 py-2 text-fg-muted text-sm hover:text-danger transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="text-center text-fg-muted text-[12px] mb-4">— or paste content —</div>

                <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">
                  Paste Markdown
                </label>
                <textarea
                  value={uploadMarkdown}
                  onChange={(e) => {
                    setUploadMarkdown(e.target.value);
                    if (e.target.value.trim()) setUploadFile(null);
                  }}
                  placeholder="# Match Analysis&#10;&#10;Paste your markdown brief here..."
                  rows={12}
                  className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none resize-y font-mono text-[13px]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  className="px-6 py-2.5 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
                >
                  Upload & Dispatch
                </button>
              </div>
            </div>
          ) : (
          /* Form Fields */
          <div className="space-y-6">
            <div>
              <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Match Title</label>
              <input
                type="text"
                value={formData.matchTitle}
                onChange={(e) => setFormData((f) => ({ ...f, matchTitle: e.target.value }))}
                placeholder="e.g., Premier League Week 15 Recap"
                className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
            </div>

            {mode === "research" && (
              <>
                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Teams</label>
                  <input
                    type="text"
                    value={formData.teams}
                    onChange={(e) => setFormData((f) => ({ ...f, teams: e.target.value }))}
                    placeholder="e.g., Arsenal vs Chelsea"
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Analysis Angle</label>
                  <select
                    value={formData.analysisAngle}
                    onChange={(e) => setFormData((f) => ({ ...f, analysisAngle: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  >
                    <option value="defensive-collapse">Defensive Collapse</option>
                    <option value="tactical-breakdown">Tactical Breakdown</option>
                    <option value="key-player-analysis">Key Player Analysis</option>
                    <option value="goal-highlights">Goal Highlights</option>
                    <option value="match-summary">Match Summary</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">
                Key Moments / Details
              </label>
              <textarea
                value={formData.keyMoments}
                onChange={(e) => setFormData((f) => ({ ...f, keyMoments: e.target.value }))}
                placeholder="Describe the key moments or details for the video..."
                rows={4}
                className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Tone</label>
              <select
                value={formData.tone}
                onChange={(e) => setFormData((f) => ({ ...f, tone: e.target.value }))}
                className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              >
                <option value="analytical">Analytical</option>
                <option value="exciting">Exciting</option>
                <option value="dramatic">Dramatic</option>
                <option value="educational">Educational</option>
                <option value="casual">Casual</option>
              </select>
            </div>

            <div>
              <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">Call to Action</label>
              <input
                type="text"
                value={formData.cta}
                onChange={(e) => setFormData((f) => ({ ...f, cta: e.target.value }))}
                placeholder="e.g., Subscribe for more match analysis!"
                className="w-full px-4 py-2.5 bg-bg border border-rule rounded-lg text-fg placeholder-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
              />
            </div>

            {/* Voice Recording */}
            <div>
              <label className="block text-fg-muted text-[12px] uppercase tracking-wider mb-2">
                Voice Input (Optional)
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleRecording}
                  disabled={!speechSupported && !mediaRecorderSupported}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    isRecording
                      ? "bg-danger text-white"
                      : speechSupported || mediaRecorderSupported
                      ? "bg-bg border border-rule text-fg hover:text-accent hover:border-accent"
                      : "bg-bg border border-rule text-fg-muted opacity-50 cursor-not-allowed"
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
                  </svg>
                  {isRecording
                    ? `Stop Recording (${recordingTime}s / 180s)`
                    : "Start Recording"}
                </button>
                {!speechSupported && !mediaRecorderSupported && (
                  <span className="text-fg-muted text-[13px]">
                    Voice input not supported in this browser
                  </span>
                )}
                {speechSupported && !isRecording && (
                  <span className="text-fg-muted text-[13px] text-xs">
                    Using browser speech recognition
                  </span>
                )}
                {!speechSupported && mediaRecorderSupported && !isRecording && (
                  <span className="text-fg-muted text-[13px] text-xs">
                    Using audio upload transcription
                  </span>
                )}
                {isRecording && recordingMethod === "media-recorder" && (
                  <span className="text-danger text-[13px] text-xs">
                    Recording will be transcribed after upload (2-5 seconds)
                  </span>
                )}
                {transcript && !isRecording && (
                  <p className="text-fg text-[13px] flex-1 truncate">
                    <span className="text-fg-muted">Transcript:</span> {transcript}
                  </p>
                )}
              </div>
              {transcript && !isRecording && (
                <button
                  onClick={() => setTranscript("")}
                  className="mt-2 px-3 py-1.5 text-xs bg-fg-muted/10 text-fg-muted rounded-lg hover:bg-fg-muted/20 transition-colors"
                >
                  Clear Transcript
                </button>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
              >
                Generate Brief
              </button>
            </div>
          </div>
          )}
        </>
      )}

      {/* ================================================================
         REVIEW STEP
         Preview generated markdown before dispatching.
         ================================================================ */}
      {dispatchState.step === "review" && (
        <div className="space-y-6">
          <div className="bg-bg rounded-xl border border-rule p-6">
            <h2 className="text-lg font-bold text-fg mb-4">Generated Brief</h2>
            <pre className="text-fg-muted text-[13px] whitespace-pre-wrap font-mono">
              {dispatchState.markdown}
            </pre>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-bg border border-rule text-fg-muted font-medium text-sm rounded-lg hover:text-fg hover:border-accent/50 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDispatch}
              className="px-6 py-2.5 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
            >
              Dispatch Render
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
         SUBMITTING STATE
         Loading indicator during submission.
         ================================================================ */}
      {dispatchState.step === "submitting" && (
        <div className="flex flex-col items-center justify-center py-16">
          <svg className="animate-spin h-12 w-12 text-accent mb-4" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="30 70" />
          </svg>
          <p className="text-fg text-lg">{dispatchState.message}</p>
        </div>
      )}

      {/* ================================================================
         DISPATCHED STATE
         Success message with links.
         ================================================================ */}
      {dispatchState.step === "dispatched" && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fg mb-2">Video Dispatched!</h2>
          <p className="text-fg-muted mb-6">Your render has been queued. Check the status in History.</p>
          <div className="flex justify-center gap-3">
            <a
              href="/history"
              className="px-4 py-2 bg-bg border border-rule text-fg-muted font-medium text-sm rounded-lg hover:text-fg hover:border-accent/50 transition-colors"
            >
              View History
            </a>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
            >
              Create Another
            </button>
          </div>
        </div>
      )}

      {/* ================================================================
         ERROR STATE
         Error message with retry option.
         ================================================================ */}
      {dispatchState.step === "error" && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-fg mb-2">Something went wrong</h2>
          <p className="text-fg-muted mb-6">{dispatchState.message}</p>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-accent text-bg font-medium text-sm rounded-lg hover:bg-accent-hover transition-colors shadow-[0_4px_16px_rgba(255,215,0,0.3)]"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";

type FormData = {
  matchTitle: string;
  teams: string;
  keyMoments: string;
  analysisAngle: string;
  tone: string;
  cta: string;
};

type BriefMode = "quick" | "research" | "topic-only";

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

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [generatedBrief, setGeneratedBrief] = useState("");
  const [briefId, setBriefId] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAndPopulate(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("Could not access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAndPopulate = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", audioBlob, "voice.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        throw new Error("Transcription failed");
      }

      const { transcript: text } = await res.json();
      setTranscript(text);
      populateFormFromTranscript(text);
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Transcription failed. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const populateFormFromTranscript = (text: string) => {
    const vsMatch = text.match(/([\w\s]+)\s+(?:vs|versus|against)\s+([\w\s]+)/i);
    if (vsMatch && !formData.teams) {
      setFormData(prev => ({ ...prev, teams: `${vsMatch[1].trim()} vs ${vsMatch[2].trim()}` }));
    }

    if (!formData.matchTitle && text.length > 10) {
      const firstSentence = text.split(/[.!?]/)[0];
      if (firstSentence.length < 100) {
        setFormData(prev => ({ ...prev, matchTitle: firstSentence.trim() }));
      }
    }

    if (!formData.keyMoments) {
      setFormData(prev => ({ ...prev, keyMoments: text }));
    }
  };

  const handleGenerateBrief = async () => {
    setIsGenerating(true);
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
        throw new Error("Brief generation failed");
      }

      const { briefId: id, markdown } = await res.json();
      setBriefId(id);
      setGeneratedBrief(markdown);
    } catch (error) {
      console.error("Brief generation error:", error);
      alert("Failed to generate brief. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveAndGenerateSpec = async () => {
    if (!briefId || !generatedBrief) return;

    alert(`Brief approved! Spec generation coming soon.\n\nBrief ID: ${briefId}`);
  };

  if (generatedBrief) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Review & Edit Brief</h1>
        <p className="text-muted mb-6">
          Edit the generated brief below, then approve to generate the video spec.
        </p>

        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-3">Brief ID: {briefId}</h2>
          <textarea
            value={generatedBrief}
            onChange={(e) => setGeneratedBrief(e.target.value)}
            className="block w-full rounded-md border px-3 py-2 font-mono text-sm"
            rows={30}
            style={{ minHeight: "600px" }}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleApproveAndGenerateSpec}
            className="btn-primary"
          >
            Approve & Generate Spec
          </button>
          <button
            onClick={() => setGeneratedBrief("")}
            className="btn-ghost"
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Brief Creator</h1>
      <p className="text-muted mb-6">
        Describe the match you just watched. This will generate a brief that feeds
        into the MD2YT pipeline to create a video spec and render.
      </p>

      <div className="card mb-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">Mode Selection</h2>
        <p className="text-sm text-muted mb-4">Choose how to generate your brief:</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="quick"
              checked={mode === "quick"}
              onChange={() => setMode("quick")}
            />
            <span className="font-medium">Quick Brief</span>
            <span className="text-sm text-muted">- Just format my input, no research</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="research"
              checked={mode === "research"}
              onChange={() => setMode("research")}
            />
            <span className="font-medium">Research-Enhanced</span>
            <span className="text-sm text-muted">- Enrich with Reddit, RSS, Trends data</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="topic-only"
              checked={mode === "topic-only"}
              onChange={() => setMode("topic-only")}
            />
            <span className="font-medium">Topic-Only Research</span>
            <span className="text-sm text-muted">- Just give a topic, we find everything</span>
          </label>
        </div>
      </div>

      <div className="card mb-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">Voice Input (Optional)</h2>
        <p className="text-sm text-muted mb-4">
          Record your thoughts and we will auto-populate the form fields below.
        </p>
        <div className="flex gap-3">
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="btn-primary"
              disabled={isTranscribing}
            >
              {isTranscribing ? "Transcribing..." : "Start Recording"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="btn-ghost"
              style={{ background: "#dc2626", color: "#fff" }}
 

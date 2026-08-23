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

export default function BriefFormPage() {
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

      const { transcript } = await res.json();
      populateFormFromTranscript(transcript);
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Transcription failed. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const populateFormFromTranscript = (transcript: string) => {
    let matchTitle = formData.matchTitle;
    let teams = formData.teams;
    let keyMoments = formData.keyMoments;

    const vsMatch = transcript.match(/([\w\s]+)\s+(?:vs|versus|against)\s+([\w\s]+)/i);
    if (vsMatch && !teams) {
      teams = `${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`;
    }

    if (!matchTitle && transcript.length > 10) {
      const firstSentence = transcript.split(/[.!?]/)[0];
      if (firstSentence.length < 100) {
        matchTitle = firstSentence.trim();
      }
    }

    if (!keyMoments) {
      keyMoments = transcript;
    }

    setFormData((prev) => ({
      ...prev,
      matchTitle: matchTitle || prev.matchTitle,
      teams: teams || prev.teams,
      keyMoments: keyMoments || prev.keyMoments,
    }));
  };

  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting brief:", formData);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Brief Creator</h1>
      <p className="text-muted mb-6">
        Describe the match you just watched. This will generate a brief that feeds
        into the MD2YT pipeline to create a video spec and render.
      </p>

      <div className="card mb-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-3">Voice Input (Optional)</h2>
        <p className="text-sm text-muted mb-4">
          Record your thoughts and we will auto-populate the form fields below. You can
          edit them before submitting.
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
            >
              Stop Recording
            </button>
          )}
        </div>
        {isRecording && (
          <p className="text-sm text-muted mt-2">Recording... Click Stop Recording when done.</p>
        )}
      </div>

      <form onSubmit={handleGenerateBrief} className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium">Match Title</label>
          <input
            type="text"
            placeholder="e.g. Why Liverpool Midfield Collapsed"
            className="block w-full rounded-md border px-3 py-2 shadow-sm"
            value={formData.matchTitle}
            onChange={(e) => setFormData({ ...formData, matchTitle: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Teams Involved</label>
          <input
            type="text"
            placeholder="e.g. Liverpool vs Manchester City"
            className="block w-full rounded-md border px-3 py-2 shadow-sm"
            value={formData.teams}
            onChange={(e) => setFormData({ ...formData, teams: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Key Moments</label>
          <textarea
            rows={3}
            placeholder="e.g. Liverpool conceded 2 in last 15 min"
            className="block w-full rounded-md border px-3 py-2 shadow-sm resize-y"
            value={formData.keyMoments}
            onChange={(e) => setFormData({ ...formData, keyMoments: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Analysis Angle</label>
          <select
            className="block w-full rounded-md border px-3 py-2 shadow-sm"
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
          <label className="block text-sm font-medium">Tone</label>
          <select
            className="block w-full rounded-md border px-3 py-2 shadow-sm"
            value={formData.tone}
            onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
          >
            <option value="analytical">Analytical</option>
            <option value="energetic">Energetic</option>
            <option value="subdued">Subdued</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">CTA</label>
          <input
            type="text"
            placeholder="e.g. Which team should we break down next"
            className="block w-full rounded-md border px-3 py-2 shadow-sm"
            value={formData.cta}
            onChange={(e) => setFormData({ ...formData, cta: e.target.value })}
            required
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Generate Brief
        </button>
      </form>
    </div>
  );
}

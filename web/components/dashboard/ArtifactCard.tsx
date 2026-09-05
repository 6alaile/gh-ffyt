"use client";

import { useRef, useState, useEffect } from "react";
import { gsap } from "gsap";

interface Artifact {
  name: string;
  url: string;
  type: "mp4" | "srt" | "json" | "log";
  size?: number;
}

interface ArtifactCardProps {
  artifact: Artifact;
  index: number;
  onPreview?: (artifact: Artifact) => void;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getTypeConfig(type: Artifact["type"]) {
  switch (type) {
    case "mp4":
      return {
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
        label: "Video",
      };
    case "json":
      return {
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        label: "Spec",
      };
    case "srt":
      return {
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ),
        color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        label: "Captions",
      };
    case "log":
      return {
        icon: (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        label: "Log",
      };
  }
}

export function ArtifactCard({ artifact, index, onPreview }: ArtifactCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const typeConfig = getTypeConfig(artifact.type);

  // Entrance animation
  useEffect(() => {
    if (cardRef.current) {
      gsap.from(cardRef.current, {
        y: 24,
        opacity: 0,
        duration: 0.5,
        delay: index * 0.08,
        ease: "power3.out",
      });
    }
  }, [index]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onPreview) {
      onPreview(artifact);
    } else {
      window.open(artifact.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      className={`
        surface surface-hover p-4 group relative overflow-hidden
        transition-all duration-normal ease-out-expo
        cursor-pointer
      `}
      style={{
        transform: isHovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: isHovered ? "0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,215,0,0.15)" : undefined,
      }}
      role="article"
      aria-label={`${typeConfig.label}: ${artifact.name}`}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(e as unknown as React.MouseEvent<Element, MouseEvent>); } }}
    >
      {/* Type indicator bar */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-1 bg-gradient-to-r transition-all duration-300
          ${isHovered ? "opacity-100" : "opacity-60"}
        `}
        style={{ background: `linear-gradient(90deg, ${typeConfig.color.replace("bg-", "").replace(" text-", "").replace(" border-", "")})` }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex items-start gap-4">
        {/* Icon */}
        <div
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300
            ${typeConfig.color}
            ${isHovered ? "scale-110 rotate-3" : ""}
          `}
          aria-hidden="true"
        >
          {typeConfig.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`badge ${typeConfig.color.replace("bg-", "").replace(" text-", "").replace(" border-", "").replace("/20", "").replace("/30", "")}`}>
              {typeConfig.label}
            </span>
            <span className="font-mono text-[11px] text-[fg-muted]">{formatSize(artifact.size)}</span>
          </div>
          <p className="font-medium text-sm truncate" title={artifact.name}>{artifact.name}</p>
          <p className="text-[12px] text-[fg-muted] mt-1">
            Click to {artifact.type === "mp4" ? "preview" : "download"}
          </p>
        </div>

        {/* Action arrow */}
        <div
          className={`
            w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300
            bg-[bg-hover] text-[fg-muted] group-hover:bg-accent/20 group-hover:text-accent
            ${isHovered ? "translate-x-1" : ""}
          `}
          aria-hidden="true"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.827 12.69l-7.5 7.5M13.827 12.69l-7.5-7.5M13.827 12.69h10.5" />
          </svg>
        </div>
      </div>

      {/* Preview overlay for video */}
      {artifact.type === "mp4" && (
        <div
          className={`
            absolute inset-0 bg-black/60 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity duration-300
            pointer-events-none
          `}
          aria-hidden="true"
        >
          <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
            <svg className="w-8 h-8 text-accent ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
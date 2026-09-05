"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

type AspectMode = "long-form" | "shorts";

interface AspectConfig {
  label: string;
  description: string;
  ratio: "16:9" | "9:16";
  icon: React.ReactNode;
  preview: string;
}

const ASPECT_CONFIG: Record<AspectMode, AspectConfig> = {
  "long-form": {
    label: "Long Form",
    description: "16:9 — retention, SEO, evergreen",
    ratio: "16:9",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <rect x="2" y="4" width="20" height="11.25" rx="2" />
      </svg>
    ),
    preview: "16:9",
  },
  "shorts": {
    label: "Shorts",
    description: "9:16 — discovery, viral reach, 60s max",
    ratio: "9:16",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <rect x="4.75" y="2" width="14.5" height="20" rx="2" />
      </svg>
    ),
    preview: "9:16",
  },
};

interface AspectSelectorProps {
  value: AspectMode;
  onChange: (mode: AspectMode) => void;
  className?: string;
}

export function AspectSelector({ value, onChange, className = "" }: AspectSelectorProps) {
  const cardRefs = useRef<Record<AspectMode, HTMLDivElement | null>>({
    "long-form": null,
    "shorts": null,
  });
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (mode: AspectMode) => {
    if (mode === value || isAnimating) return;
    setIsAnimating(true);
    onChange(mode);

    // FLIP animation
    const fromState = Flip.getState(cardRefs.current[value]!);
    // Force reflow by reading layout
    requestAnimationFrame(() => {
      const toState = Flip.getState(cardRefs.current[mode]!);
      Flip.from(fromState, {
        duration: 0.35,
        ease: "power2.out",
        onComplete: () => setIsAnimating(false),
      });
    });
  };

  return (
    <div className={`grid grid-cols-2 gap-4 ${className}`} role="radiogroup" aria-label="Aspect ratio">
      {(["long-form", "shorts"] as AspectMode[]).map((mode) => {
        const config = ASPECT_CONFIG[mode];
        const isActive = value === mode;

        return (
          <div
            key={mode}
            ref={(el) => { cardRefs.current[mode] = el; }}
            role="radio"
            aria-checked={isActive}
            tabIndex={0}
            onClick={() => handleClick(mode)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(mode); } }}
            className={`
              relative surface surface-hover p-6 group
              ${isActive ? "border-accent/50 bg-[accent-soft] shadow-glow" : ""}
              ${isAnimating ? "pointer-events-none" : ""}
            `}
            style={{ willChange: isAnimating ? "transform, width, height" : "auto" }}
          >
            {/* Active indicator */}
            <div
              className={`
                absolute top-3 right-3 w-6 h-6 rounded-full transition-all duration-300 ease-out-expo
                ${isActive
                  ? "bg-accent scale-100 opacity-100"
                  : "bg-transparent scale-0 opacity-0"
                }
              `}
              aria-hidden="true"
            >
              <svg className="w-4 h-4 text-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            {/* Preview frame */}
            <div className="relative mb-4" aria-hidden="true">
              <div
                className={`
                  mx-auto border-2 border-rule/50 transition-all duration-300 ease-out-expo
                  ${isActive ? "border-accent/50" : ""}
                `}
                style={{
                  aspectRatio: config.ratio,
                  maxWidth: "100%",
                  maxHeight: 120,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-1">
                  <span className="text-[10px] font-mono text-accent/60 px-1.5 py-0.5 bg-bg/80 rounded border border-rule/50">
                    {config.preview}
                  </span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300
                  ${isActive ? "bg-accent text-bg" : "bg-[bg-hover] text-[fg-muted] group-hover:bg-accent/10 group-hover:text-accent"}
                `}>
                  {config.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-tight">{config.label}</h3>
                  <p className="text-[13px] text-[fg-muted]">{config.description}</p>
                </div>
              </div>

              {/* Safe zone indicators */}
              <div className="flex items-center gap-2 text-[11px] text-[fg-muted]">
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[bg-hover] rounded border border-rule/50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M12 3v18M3 12h18" strokeLinecap="round" />
                  </svg>
                  Title safe
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[bg-hover] rounded border border-rule/50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" />
                  </svg>
                  Action safe
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
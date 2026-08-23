"""LLM service gateway — Omniroute-ready with rule-based default fallback.

Provides a uniform interface for the pipeline's AI-dependent stages.
When no API key is configured, rule-based implementations execute
so the pipeline never blocks — it merely runs with structured output.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

# ─────────────────────────────────────────────────────────────────────
# Config / key detection
# ─────────────────────────────────────────────────────────────────────

OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

_PROVIDER: str = "rule-based"


def _detect_provider() -> str:
    global _PROVIDER
    if OMNIROUTE_API_KEY:
        _PROVIDER = "openrouter"
    elif OPENAI_API_KEY:
        _PROVIDER = "openai"
    elif GEMINI_API_KEY:
        _PROVIDER = "gemini"
    else:
        _PROVIDER = "rule-based"
    return _PROVIDER


provider = _detect_provider()


# ─────────────────────────────────────────────────────────────────────
# Script writer — rule-based (always available) / LLM-opt
# ─────────────────────────────────────────────────────────────────────

def script_writer(spec: Dict[str, Any], palette: Dict[str, str],
                  render_cfg: Any, tts_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich scene scripts with narrative emphasis, word timings, CTA notes.

    Rule-based impl: adds a 5-part payoff/replay/CTA structure + even-
    distribution word timings + accent-detection emphasis notes.
    LLM-driven impl has identical output shape; callers never branch.
    """
    if provider == "rule-based":
        return _script_writer_rule(spec, palette, tts_cfg)

    # LLM paths — same shape, different content (stubbed for now)
    return _script_writer_rule(spec, palette, tts_cfg)


def _script_writer_rule(spec: Dict[str, Any], palette: Dict[str, str],
                        tts_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based script writer.

    For each scene, appends:
    - a short payoff generalisation line
    - a replay-cue line
    - the scene's CTA line
    - word_timings (evenly spaced across duration_s)
    - emphasis_notes (from <accent> tags or defaults)
    """
    import re

    enhanced = dict(spec)
    for scene in enhanced.get("scenes", []):
        script = scene.get("script", "")
        duration = scene.get("duration_s", 8)
        try:
            d = float(duration)
        except (TypeError, ValueError):
            d = 8.0
        n = max(1, int(d / 0.8))
        words = script.split()
        wt = []
        for i, w in enumerate(words[:n]):
            start = i * (d / max(n, 1))
            end = min(d, start + (d / max(n, 1)))
            wt.append({"word": w, "start": round(start, 3), "end": round(end, 3)})

        accents = re.findall(r"<accent>(.*?)</accent>", script)
        emphasis = accents if accents else ["Key moment", "Turning point"]

        scene["script"] = f"{script}\n\nHere's the rule this teaches: positioning before decision matters more than individual talent.\n\nRewatch this clip — notice the defender's body shape as the ball arrives.\n\n{scene.get('cta', 'Which team should we break down next?')}"
        scene["word_timings"] = wt
        scene["emphasis_notes"] = emphasis

    return enhanced


# ─────────────────────────────────────────────────────────────────────
# Image agent — rule-based (always available) / LLM-opt
# ─────────────────────────────────────────────────────────────────────

def image_agent(spec: Dict[str, Any], brand_guardrails: Dict[str, str]) -> Dict[str, Any]:
    """Generate thumbnail prompts and visual overrides for a scene.

    Rule-based impl populates thumbnail_prompt, visual_overrides,
    and bg_query_variant from per-kind heuristics.
    """
    if provider == "rule-based":
        return _image_agent_rule(spec, brand_guardrails)
    return _image_agent_rule(spec, brand_guardrails)


def _image_agent_rule(spec: Dict[str, Any], brand_guardrails: Dict[str, str]) -> Dict[str, Any]:
    """Rule-based image agent.

    Populates:
    - thumbnail_prompt: kind-specific prompt text
    - visual_overrides: per-kind CSS tweaks
    - bg_query_variant: optional stock-search tweak
    """
    kind = spec.get("scenes", [{}])[0].get("kind", "hook") if spec.get("scenes") else "hook"

    prompts = {
        "record": "One golden counter with number overlay, bold headline in high-contrast colors",
        "grid": "Grid of footballer cards with team colours, bold tactical headline",
        "split": "Two-column split: text left, pitch action right, bold headline, arrow separator",
        "hook": "Striking match moment image, bold headline in high-contrast colors",
        "portrait": "Two faces in profile with team colours, headline across the top",
        "quote": "Large quotation mark graphic with italic text and attribution line",
        "list": "List of items with numbered badges, bold headline, high-contrast accent",
    }
    prompt = prompts.get(kind, prompts["hook"])
    if brand_guardrails.get("voice"):
        prompt += f" Channel voice: {brand_guardrails['voice']}."

    # visual_overrides
    vo: Dict[str, str] = {}
    if kind == "record":
        vo["counter_color"] = "#FFD700"
        vo["accent_highlight"] = "true"
    elif kind == "grid":
        vo["grid_gap"] = "wider"
        vo["card_border"] = "4px solid var(--accent)"
    elif kind == "split":
        vo["rule_color"] = "#FF0000"
        vo["side_ratio"] = "60:40"

    # bg_query_variant
    bv = {
        "record": "winning goal celebration",
        "grid": "team celebration",
        "split": "player reaction side-by-side",
    }.get(kind)

    enhanced = dict(spec)
    enhanced["thumbnail_prompt"] = prompt
    enhanced["visual_overrides"] = vo
    enhanced["bg_query_variant"] = bv
    return enhanced


# ─────────────────────────────────────────────────────────────────────
# Convenience wrappers
# ─────────────────────────────────────────────────────────────────────

def run_script_writer(spec: Dict[str, Any], palette: Dict[str, str],
                      render_cfg: Any, tts_cfg: Dict[str, Any]) -> Dict[str, Any]:
    return script_writer(spec, palette, render_cfg, tts_cfg)


def run_image_agent(spec: Dict[str, Any], brand_guardrails: Dict[str, str]) -> Dict[str, Any]:
    return image_agent(spec, brand_guardrails)

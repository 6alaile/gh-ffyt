"""LLM service gateway — Gemini-first (free tier), OpenRouter/OpenAI as
configured upgrades, rule-based as the always-available fallback.

Provides a uniform interface for the pipeline's AI-dependent stages.
When no API key is configured, or when LLM generation fails validation
twice (see llm.generate), rule-based implementations execute so the
pipeline never blocks — it merely runs with structured output.
"""
from __future__ import annotations

import json
import os
import re
from functools import partial
from typing import Any, Dict, List, Optional

from .generate import GenerationValidationError, generate_validated
from .providers import ProviderError, call_gemini, call_openrouter

# ─────────────────────────────────────────────────────────────────────
# Config / key detection
# ─────────────────────────────────────────────────────────────────────

OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY") or os.getenv("OPENROUTER_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def _detect_provider() -> str:
    """Priority mirrors web/lib/llm/provider.ts's getLLMProvider(): Gemini
    (free tier, no expiration, no credit system) first, then OpenRouter/
    OpenAI as configured upgrades, then rule-based as the last resort.
    """
    if GEMINI_API_KEY:
        return "gemini"
    if OMNIROUTE_API_KEY:
        return "openrouter"
    if OPENAI_API_KEY:
        return "openai"
    return "rule-based"


provider = _detect_provider()


def _call_fn_for_provider() -> Optional[Any]:
    """Returns a single-argument (prompt) -> str callable for the active
    provider, or None if no provider is configured."""
    if provider == "gemini":
        return partial(call_gemini, api_key=GEMINI_API_KEY)
    if provider == "openrouter":
        return partial(call_openrouter, api_key=OMNIROUTE_API_KEY, use_openrouter=True)
    if provider == "openai":
        return partial(call_openrouter, api_key=OPENAI_API_KEY, use_openrouter=False)
    return None


# ─────────────────────────────────────────────────────────────────────
# Script writer — rule-based (always available) / LLM-enriched
# ─────────────────────────────────────────────────────────────────────

def script_writer(spec: Dict[str, Any], palette: Dict[str, str],
                  render_cfg: Any, tts_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Enrich scene scripts with narrative emphasis, word timings, CTA notes.

    Rule-based impl: adds a 5-part payoff/replay/CTA structure + even-
    distribution word timings + accent-detection emphasis notes.
    LLM-enriched impl replaces the payoff/replay commentary with scene-
    specific content (validated JSON, one repair retry); word_timings
    stay locally computed either way — that's layout, not content.
    Falls back to the rule-based impl on any provider/validation failure,
    so this never blocks the pipeline.
    """
    call_fn = _call_fn_for_provider()
    if call_fn is None:
        return _script_writer_rule(spec, palette, tts_cfg)

    try:
        return _script_writer_llm(spec, palette, tts_cfg, call_fn)
    except (ProviderError, GenerationValidationError) as exc:
        print(f"script_writer: LLM enrichment failed ({exc}), falling back to rule-based")
        return _script_writer_rule(spec, palette, tts_cfg)


def _script_writer_llm(spec: Dict[str, Any], palette: Dict[str, str],
                       tts_cfg: Dict[str, Any], call_fn: Any) -> Dict[str, Any]:
    enhanced = dict(spec)
    for scene in enhanced.get("scenes", []):
        script = scene.get("script", "")
        duration = scene.get("duration_s", 8)

        prompt = (
            "You are a tactical football YouTube commentator. Given this scene script:\n"
            f'"{script}"\n\n'
            "Respond with ONLY valid JSON (no markdown fences) matching this shape:\n"
            '{"commentary": "<2-3 sentences of scene-specific tactical commentary>", '
            '"replay_cue": "<1 sentence directing the viewer to rewatch a specific detail>", '
            '"emphasis_notes": ["<key phrase 1>", "<key phrase 2>"]}'
        )

        def validate(raw: str) -> Dict[str, Any]:
            cleaned = re.sub(r"^```(?:json)?\n?|\n?```$", "", raw.strip())
            data = json.loads(cleaned)
            for key in ("commentary", "replay_cue", "emphasis_notes"):
                if key not in data:
                    raise ValueError(f"missing required field {key!r}")
            if not isinstance(data["emphasis_notes"], list) or not data["emphasis_notes"]:
                raise ValueError("emphasis_notes must be a non-empty list")
            return data

        result = generate_validated(call_fn, prompt, validate)

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

        scene["script"] = f"{script}\n\n{result['commentary']}\n\n{result['replay_cue']}\n\n{scene.get('cta', 'Which team should we break down next?')}"
        scene["word_timings"] = wt
        scene["emphasis_notes"] = result["emphasis_notes"]

    return enhanced


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

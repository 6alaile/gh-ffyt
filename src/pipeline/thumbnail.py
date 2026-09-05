"""
thumbnail.py — thumbnail prompt + image generation for the render pipeline.

The prompt-construction rules (style descriptions, and critically the
integrity constraints — no fabricated claims, no invented text, no
guaranteed outcomes) are ported from youtubepro's buildThumbnailPrompt()
(server/gemini.ts). That project builds prompts around creator-uploaded
reference photos (subject/style/background/composition references) via
Gemini's multimodal image API; this pipeline generates thumbnails
entirely from scratch from brief content (title, angle, brand palette),
so the reference-image machinery is dropped and replaced with brand/
scene-kind context instead. The integrity rules carry over unchanged —
they're exactly the visual analog of the evidence-grounding work
already done for scripts: a thumbnail claiming a shocking, specific,
made-up number is the same failure mode as a fabricated script stat.

Image generation uses Pollinations' Flux endpoint (image.pollinations.ai),
which remains free/unlimited/keyless — unaffected by the Pollen credit
system now metering Pollinations' *text* generation (see
src/pipeline/llm/providers.py's module docstring). `model=flux` is
passed explicitly rather than relying on the endpoint's default, since
Pollinations' documented default model has changed over time (to
"zimage" as of the current APIDOCS.md) and flux is what's expected here.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from urllib.parse import quote

STYLE_DESCRIPTIONS: Dict[str, str] = {
    "bold": "strong contrast, a clear focal point, and restrained dramatic emphasis",
    "cinematic": "film-poster composition, dimensional lighting, and a focused visual story",
    "tech": "a precise modern layout, controlled gradients, and a polished technology aesthetic",
    "minimal": "a clean, simple background, ample negative space, and one clear focal point",
}

DEFAULT_STYLE = "bold"

POLLINATIONS_IMAGE_ENDPOINT = "https://image.pollinations.ai/prompt/"


def build_thumbnail_prompt(
    spec: Dict[str, Any],
    brand_guardrails: Dict[str, str],
    style: str = DEFAULT_STYLE,
    main_text: Optional[str] = None,
) -> str:
    """Build a Flux prompt for one 16:9 thumbnail from brief content.

    `main_text` should be the exact on-image text (e.g. the hook
    headline) — if given, the prompt instructs the model to render only
    that text and invent nothing else, mirroring the evidence-grounding
    rule against inventing specifics.
    """
    scenes = spec.get("scenes", [])
    kind = scenes[0].get("kind", "hook") if scenes else "hook"
    title = spec.get("id", "match breakdown").replace("_", " ")
    style_desc = STYLE_DESCRIPTIONS.get(style, STYLE_DESCRIPTIONS[DEFAULT_STYLE])

    palette_line = ""
    if brand_guardrails.get("accent") or brand_guardrails.get("background"):
        palette_line = (
            f"- Color palette: background {brand_guardrails.get('background', '#0a0a0a')}, "
            f"accent {brand_guardrails.get('accent', '#FFD700')}, "
            f"text {brand_guardrails.get('text', '#FFFFFF')}."
        )

    text_instruction = (
        f'Render only the following supplied text. Do not invent extra words.\n'
        f'Main text: "{main_text}"\n'
        "Reserve a clear area for readable text and keep it clear of faces and key objects.\n"
        "Prioritize mobile-size legibility and accurate spelling."
        if main_text
        else "Do not render any words, letters, logos, watermarks, or interface text."
    )

    return f"""Create one original 16:9 YouTube thumbnail that truthfully packages this video.

Video topic: "{title}"
Scene type: {kind}

Visual direction:
- Style: {style}. {style_desc}
{palette_line}
- Build one obvious focal point and a visual hierarchy that remains understandable on a phone.

Text direction:
{text_instruction}

Quality and integrity requirements:
- Match the video's actual content — do not add unsupported claims, fabricated statistics, deceptive before-and-after framing, or false urgency.
- Do not imitate a named creator or reproduce another thumbnail.
- Do not guarantee views, clicks, revenue, or any outcome.
- Football/soccer scene, no text logos of real clubs or leagues rendered as branded marks.
- Return one polished thumbnail image at 16:9."""


def thumbnail_image_url(prompt: str, seed: Optional[int] = None, width: int = 1280, height: int = 720) -> str:
    """Build the Pollinations Flux GET URL for a thumbnail. No API call
    happens here — this just constructs the URL; use fetchers.download_file()
    to actually save it, matching the existing Pixabay/Pexels pattern."""
    params = {
        "model": "flux",
        "width": width,
        "height": height,
        "nologo": "true",
        "safe": "true",
        "enhance": "false",  # keep literal — we already wrote the exact prompt/text rules
    }
    if seed is not None:
        params["seed"] = seed
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{POLLINATIONS_IMAGE_ENDPOINT}{quote(prompt)}?{query}"

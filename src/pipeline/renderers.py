"""
renderers.py — per-kind scene content + CSS + animation generators.

Each function takes a scene dict (already validated by schema.py)
and returns three strings:

  - css: extra CSS to inject into the base template
  - content: the inner HTML of <div class="scene-content">
  - anim: JavaScript that builds the GSAP timeline for this scene

Slot conventions:
  - All element ids are scoped by scene id: e.g. scene["id"] + "-eyebrow".
  - Animations only target this scene's elements; no cross-scene logic.
  - Timeline is paused on construction; HyperFrames drives it via window.__timelines.

CSS class names are prefixed with `s-` (the variable `cls` here) because
the spec allows scene ids that start with a digit (e.g. "01_hook"), and
CSS identifiers cannot begin with one. The same `cls` is used in the
generated HTML class attributes and in the CSS/JS selectors so the three
stay in sync.
"""

from __future__ import annotations

from typing import Any


def cls(sid: str) -> str:
    """CSS-safe class prefix for a scene id. Scene ids may start with a
    digit (e.g. "01_hook"), which is illegal as a CSS identifier start;
    we prefix with "s-" to keep all generated selectors valid."""
    return f"s-{sid}"


def _aspect_ratio(scene: dict[str, Any]) -> str:
    return scene.get("aspect_ratio") or "16:9"


def _aspect_layout_css(scene: dict[str, Any]) -> str:
    """Stack multi-column layouts vertically for 9:16 Shorts."""
    if _aspect_ratio(scene) != "9:16":
        return ""

    sid = cls(scene["id"])
    kind = scene["kind"]
    rules: list[str] = [
        "body[data-aspect-ratio=\"9:16\"] #scene1 .scene-content {",
        "  flex-direction: column !important;",
        "  align-items: stretch !important;",
        "  padding: 80px 48px !important;",
        "  gap: 40px !important;",
        "}",
    ]

    if kind == "scale":
        rules.extend([
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-left {{ width: 100%; }}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-right {{",
            "  flex: 1 1 auto !important; width: 100%;",
            "}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-headline {{ font-size: 96px; }}",
        ])
    elif kind == "record":
        rules.extend([
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-counter-wrap {{",
            "  flex: 1 1 auto !important; width: 100%;",
            "}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-right {{ width: 100%; }}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-counter {{ font-size: 220px; }}",
        ])
    elif kind == "grid":
        rules.extend([
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-grid {{",
            "  grid-template-columns: 1fr !important;",
            "}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-headline {{ font-size: 72px; }}",
        ])
    elif kind == "split":
        rules.extend([
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-left {{ width: 100%; }}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-right {{",
            "  flex: 1 1 auto !important; width: 100%; min-height: 240px;",
            "}",
            f"body[data-aspect-ratio=\"9:16\"] #scene1 .{sid}-headline {{ font-size: 88px; }}",
        ])

    return "\n      ".join(rules)


def _kinetic_subtitles(scene: dict[str, Any]) -> tuple[str, str, str]:
    """Build CSS, HTML, and GSAP for word-synced kinetic subtitles.

    Uses `scene["word_timings"]` from Edge TTS WordBoundary events.
    Returns empty strings when timings are missing.
    """
    word_timings: list[dict[str, Any]] = scene.get("word_timings") or []
    if not word_timings:
        return "", "", ""

    sid = cls(scene["id"])
    spans = "".join(
        f'<span class="word {sid}-word" data-i="{i}">{w["word"]}</span>'
        for i, w in enumerate(word_timings)
    )
    css = f"""
      #scene1 .{sid}-subtitles {{
        position: absolute;
        left: 48px; right: 48px;
        bottom: 96px;
        z-index: 4;
        text-align: center;
        font-size: clamp(24px, 2.8vw, 36px);
        line-height: 1.45;
        pointer-events: none;
      }}
      #scene1 .{sid}-subtitles .word {{
        display: inline;
        opacity: 0.35;
        color: var(--fg);
        margin-right: 0.28em;
        transition: none;
      }}
      body[data-aspect-ratio="9:16"] #scene1 .{sid}-subtitles {{
        bottom: 112px;
        font-size: clamp(22px, 3.2vw, 30px);
        padding: 0 12px;
      }}
    """
    html = f'<div class="kinetic-subtitles {sid}-subtitles">{spans}</div>'

    anim_parts = [
        f'gsap.set(".{sid}-subtitles .word", {{ opacity: 0.35, color: "var(--fg)" }});',
    ]
    for i, w in enumerate(word_timings):
        start_s = max(0.0, w.get("start", 0) / 1000.0)
        word_dur = max(0.05, (w.get("end", 0) - w.get("start", 0)) / 1000.0)
        highlight_dur = min(0.25, word_dur * 0.5)
        anim_parts.append(
            f'tl.to(".{sid}-word[data-i=\\"{i}\\"]", '
            f'{{ opacity: 1, color: "var(--accent)", duration: {highlight_dur:.3f}, '
            f'ease: "power2.out" }}, {start_s:.3f});'
        )
        if i > 0:
            prev = i - 1
            anim_parts.append(
                f'tl.to(".{sid}-word[data-i=\\"{prev}\\"]", '
                f'{{ opacity: 0.45, color: "var(--fg)", duration: 0.12, ease: "power2.in" }}, '
                f'{start_s:.3f});'
            )

    return css, html, "\n      ".join(anim_parts)


def hook(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene["eyebrow"]
    headline = scene["headline"]
    subhead = scene["subhead"]
    css = f"""
      #scene1 .scene-content {{ align-items: center; text-align: center; gap: 0; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 24px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
        margin-bottom: 24px;
      }}
      #scene1 .{sid}-headline {{ font-size: 170px; color: var(--fg); }}
      #scene1 .{sid}-headline .accent {{ color: var(--accent); }}
      #scene1 .{sid}-subhead {{
        font-family: "JetBrains Mono", monospace;
        font-size: 28px; color: var(--muted);
        letter-spacing: 0.1em; text-transform: uppercase;
        margin-top: 32px;
      }}
    """
    content = f"""
      <div class="eyebrow {sid}-eyebrow">{eyebrow}</div>
      <h1 class="display headline {sid}-headline">{headline}</h1>
      <div class="subhead {sid}-subhead">{subhead}</div>
    """
    anim = f"""
      gsap.set(".{sid}-eyebrow", {{ y: -30, opacity: 0 }});
      gsap.set(".{sid}-headline", {{ y: 80, opacity: 0, scale: 0.9 }});
      gsap.set(".{sid}-subhead", {{ y: 20, opacity: 0 }});
      tl.to(".{sid}-eyebrow", {{ y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }}, 0.3);
      tl.to(".{sid}-headline", {{ y: 0, opacity: 1, scale: 1, duration: 0.8, ease: "expo.out" }}, 0.7);
      tl.to(".{sid}-subhead", {{ y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }}, 2.0);
      tl.to("#scene1 .bottom-bar .pill", {{ scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" }}, 3.0);
      // final fade out
      tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});
    """
    return css, content, anim


def scale(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene.get("eyebrow", "")
    headline = scene["headline"]
    sub = scene.get("sub", "")
    stats = scene["stats"]

    css = f"""
      #scene1 .scene-content {{ padding: 0 120px; flex-direction: row; align-items: stretch; gap: 80px; }}
      #scene1 .{sid}-left {{ flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 40px; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
      }}
      #scene1 .{sid}-headline {{ font-size: 150px; color: var(--fg); }}
      #scene1 .{sid}-sub {{ font-size: 36px; color: var(--fg); max-width: 720px; line-height: 1.3; }}
      #scene1 .{sid}-right {{ flex: 0 0 700px; display: flex; flex-direction: column; justify-content: center; gap: 24px; }}
      #scene1 .{sid}-stat {{
        display: flex; flex-direction: column; gap: 8px;
        padding: 24px 32px; border-left: 4px solid var(--accent);
        background: rgba(255,215,0,0.04);
      }}
      #scene1 .{sid}-stat .num {{ font-size: 110px; color: var(--accent); line-height: 0.9; }}
      #scene1 .{sid}-stat .label {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--fg);
        letter-spacing: 0.1em; text-transform: uppercase;
      }}
    """
    stats_html = "".join(
        f'<div class="{sid}-stat" data-i="{i}"><span class="num">{s["num"]}</span><span class="label">{s["label"]}</span></div>'
        for i, s in enumerate(stats)
    )
    eyebrow_html = (
        f'<div class="eyebrow {sid}-eyebrow">{eyebrow}</div>' if eyebrow else ""
    )
    sub_html = f'<p class="sub {sid}-sub">{sub}</p>' if sub else ""
    content = f"""
      <div class="{sid}-left">
        {eyebrow_html}
        <h2 class="display headline {sid}-headline">{headline}</h2>
        {sub_html}
      </div>
      <div class="{sid}-right">
        {stats_html}
      </div>
    """
    anim_parts = [f'gsap.set(".{sid}-headline", {{ y: 60, opacity: 0 }});']
    if eyebrow:
        anim_parts.append(f'gsap.set(".{sid}-eyebrow", {{ x: -40, opacity: 0 }});')
    if sub:
        anim_parts.append(f'gsap.set(".{sid}-sub", {{ y: 30, opacity: 0 }});')
    for i in range(len(stats)):
        anim_parts.append(
            f'gsap.set("[data-i=\\"{i}\\"]", {{ x: 60, opacity: 0 }});'
        )

    anim_parts.append(
        f'tl.to(".{sid}-eyebrow", {{ x: 0, opacity: 1, duration: 0.6, ease: "power3.out" }}, 0.4);'
    )
    anim_parts.append(
        f'tl.to(".{sid}-headline", {{ y: 0, opacity: 1, duration: 0.7, ease: "expo.out" }}, 0.7);'
    )
    anim_parts.append(
        f'tl.to(".{sid}-sub", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 1.4);'
    )
    for i in range(len(stats)):
        anim_parts.append(
            f'tl.to("[data-i=\\"{i}\\"]", {{ x: 0, opacity: 1, duration: 0.5, ease: "back.out(1.4)" }}, {1.8 + i * 0.4});'
        )
    anim_parts.append(
        f'tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});'
    )
    return css, content, "\n      ".join(anim_parts)


def portrait(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene["eyebrow"]
    headline = scene["headline"]
    sub = scene.get("sub", "")
    names = scene["names"]

    css = f"""
      #scene1 .scene-content {{ align-items: center; text-align: center; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
        margin-bottom: 24px;
      }}
      #scene1 .{sid}-headline {{ font-size: 220px; color: var(--fg); }}
      #scene1 .{sid}-sub {{
        font-size: 38px; color: var(--fg);
        max-width: 1100px; margin-top: 24px;
        font-style: italic; font-weight: 300;
      }}
      #scene1 .{sid}-names {{
        display: flex; gap: 80px; margin-top: 40px;
        align-items: center; justify-content: center;
      }}
      #scene1 .{sid}-name {{ font-size: 80px; color: var(--accent); }}
      #scene1 .{sid}-name .year {{
        font-family: "JetBrains Mono", monospace;
        font-size: 24px; color: var(--muted);
        letter-spacing: 0.1em; display: block; margin-top: 8px;
      }}
      #scene1 .{sid}-vs {{
        font-family: "JetBrains Mono", monospace;
        font-size: 32px; color: var(--muted);
      }}
    """

    name_blocks = []
    for i, n in enumerate(names):
        if i > 0:
            name_blocks.append(f'<div class="{sid}-vs mono">VS</div>')
        name_blocks.append(
            f'<div class="display {sid}-name">{n["name"]}<span class="year mono">{n["year"]}</span></div>'
        )
    names_html = "".join(name_blocks)
    sub_html = f'<p class="sub {sid}-sub">{sub}</p>' if sub else ""
    content = f"""
      <div class="eyebrow {sid}-eyebrow">{eyebrow}</div>
      <h2 class="display headline {sid}-headline">{headline}</h2>
      {sub_html}
      <div class="{sid}-names">{names_html}</div>
    """
    anim = f"""
      gsap.set(".{sid}-eyebrow", {{ letterSpacing: "0.8em", opacity: 0 }});
      gsap.set(".{sid}-headline", {{ y: 100, opacity: 0, scale: 0.85 }});
      gsap.set(".{sid}-sub", {{ y: 20, opacity: 0 }});
      gsap.set(".{sid}-name:nth-child(1)", {{ x: -100, opacity: 0 }});
      gsap.set(".{sid}-vs", {{ scale: 0, opacity: 0 }});
      tl.to(".{sid}-eyebrow", {{ letterSpacing: "0.4em", opacity: 1, duration: 1.0, ease: "power2.out" }}, 0.5);
      tl.to(".{sid}-headline", {{ y: 0, opacity: 1, scale: 1, duration: 1.0, ease: "expo.out" }}, 1.0);
      tl.to(".{sid}-sub", {{ y: 0, opacity: 1, duration: 0.7, ease: "power2.out" }}, 4.0);
      tl.to(".{sid}-name:nth-child(1)", {{ x: 0, opacity: 1, duration: 0.8, ease: "expo.out" }}, 5.0);
      tl.to(".{sid}-vs", {{ scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }}, 5.3);
      tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});
    """
    return css, content, anim


def record(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene.get("eyebrow", "")
    counter_label = scene["counter_label"]
    counter_num = scene["counter_num"]
    counter_suffix = scene["counter_suffix"]
    name = scene["name"]
    quote = scene.get("quote", "")

    css = f"""
      #scene1 .scene-content {{ padding: 0 120px; flex-direction: row; align-items: center; gap: 80px; }}
      #scene1 .{sid}-counter-wrap {{
        flex: 0 0 900px; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 60px;
        border: 4px solid var(--accent);
        background: rgba(255,215,0,0.05);
      }}
      #scene1 .{sid}-counter-label {{
        font-family: "JetBrains Mono", monospace;
        font-size: 24px; color: var(--accent);
        letter-spacing: 0.3em; text-transform: uppercase;
        margin-bottom: 16px;
      }}
      #scene1 .{sid}-counter {{ font-size: 380px; color: var(--accent); line-height: 0.85; }}
      #scene1 .{sid}-counter-suffix {{
        font-family: "JetBrains Mono", monospace;
        font-size: 36px; color: var(--fg);
        letter-spacing: 0.1em; text-transform: uppercase;
        margin-top: 16px;
      }}
      #scene1 .{sid}-right {{ flex: 1; display: flex; flex-direction: column; gap: 32px; }}
      #scene1 .{sid}-name {{ font-size: 130px; color: var(--fg); }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 32px; color: var(--accent);
        letter-spacing: 0.15em; text-transform: uppercase;
      }}
      #scene1 .{sid}-quote {{
        font-size: 36px; color: var(--fg);
        line-height: 1.3; border-left: 4px solid var(--accent);
        padding-left: 24px; margin-top: 24px;
      }}
    """
    eyebrow_html = (
        f'<div class="{sid}-eyebrow">{eyebrow}</div>' if eyebrow else ""
    )
    quote_html = (
        f'<p class="quote {sid}-quote">{quote}</p>' if quote else ""
    )
    content = f"""
      <div class="{sid}-counter-wrap">
        <div class="{sid}-counter-label">{counter_label}</div>
        <div class="display {sid}-counter">{counter_num}</div>
        <div class="{sid}-counter-suffix">{counter_suffix}</div>
      </div>
      <div class="{sid}-right">
        {eyebrow_html}
        <h2 class="display {sid}-name">{name}</h2>
        {quote_html}
      </div>
    """
    anim = f"""
      gsap.set(".{sid}-counter-wrap", {{ scale: 0.5, opacity: 0 }});
      gsap.set(".{sid}-counter", {{ scale: 0, opacity: 0 }});
      gsap.set(".{sid}-eyebrow", {{ y: 20, opacity: 0 }});
      gsap.set(".{sid}-name", {{ x: 80, opacity: 0 }});
      gsap.set(".{sid}-quote", {{ y: 30, opacity: 0 }});
      tl.to(".{sid}-counter-wrap", {{ scale: 1, opacity: 1, duration: 0.6, ease: "expo.out" }}, 0.4);
      tl.to(".{sid}-counter", {{ scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }}, 0.8);
      tl.to(".{sid}-eyebrow", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 1.5);
      tl.to(".{sid}-name", {{ x: 0, opacity: 1, duration: 0.7, ease: "expo.out" }}, 2.0);
      tl.to(".{sid}-quote", {{ y: 0, opacity: 1, duration: 0.6, ease: "power2.out" }}, 2.8);
      tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});
    """
    return css, content, anim


def grid(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene.get("eyebrow", "")
    headline = scene["headline"]
    cards = scene["cards"]

    css = f"""
      #scene1 .scene-content {{ padding: 0 120px; align-items: stretch; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
        margin-bottom: 12px;
      }}
      #scene1 .{sid}-headline {{ font-size: 110px; color: var(--fg); margin-bottom: 32px; }}
      #scene1 .{sid}-grid {{
        display: grid; grid-template-columns: repeat({len(cards)}, 1fr);
        gap: 40px; flex: 1;
      }}
      #scene1 .{sid}-card {{
        display: flex; flex-direction: column; gap: 16px;
        padding: 40px 32px;
        background: rgba(255,255,255,0.03);
        border-top: 6px solid var(--accent);
      }}
      #scene1 .{sid}-card .flag {{ font-size: 90px; line-height: 1; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); }}
      #scene1 .{sid}-card-name {{ font-size: 64px; color: var(--fg); }}
      #scene1 .{sid}-card-stats {{ display: flex; flex-direction: column; gap: 4px; margin-top: auto; }}
      #scene1 .{sid}-card-stat {{
        font-family: "JetBrains Mono", monospace;
        font-size: 20px; color: var(--muted);
        letter-spacing: 0.05em; text-transform: uppercase;
      }}
      #scene1 .{sid}-card-stat .v {{ color: var(--fg); }}
      #scene1 .{sid}-card-quote {{
        font-size: 22px; color: var(--accent);
        line-height: 1.3; font-style: italic; margin-top: 12px;
      }}
    """

    cards_html = []
    for i, c in enumerate(cards):
        stats_html = "".join(f'<div class="{sid}-card-stat">{s}</div>' for s in c.get("stats", []))
        cards_html.append(
            f'<div class="{sid}-card" data-i="{i}">'
            f'<div class="flag">{c["flag"]}</div>'
            f'<div class="display {sid}-card-name">{c["name"]}</div>'
            f'<div class="{sid}-card-stats">{stats_html}</div>'
            f'<div class="{sid}-card-quote">{c.get("quote", "")}</div>'
            f'</div>'
        )
    eyebrow_html = (
        f'<div class="eyebrow {sid}-eyebrow">{eyebrow}</div>' if eyebrow else ""
    )
    content = f"""
      {eyebrow_html}
      <h2 class="display headline {sid}-headline">{headline}</h2>
      <div class="{sid}-grid">{"".join(cards_html)}</div>
    """
    anim_parts = [
        f'gsap.set(".{sid}-eyebrow", {{ y: -20, opacity: 0 }});',
        f'gsap.set(".{sid}-headline", {{ y: 60, opacity: 0 }});',
    ]
    for i in range(len(cards)):
        anim_parts.append(f'gsap.set("[data-i=\\"{i}\\"]", {{ y: 80, opacity: 0 }});')
    anim_parts.append(
        f'tl.to(".{sid}-eyebrow", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 0.3);'
    )
    anim_parts.append(
        f'tl.to(".{sid}-headline", {{ y: 0, opacity: 1, duration: 0.7, ease: "expo.out" }}, 0.6);'
    )
    for i in range(len(cards)):
        anim_parts.append(
            f'tl.to("[data-i=\\"{i}\\"]", {{ y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }}, {1.3 + i * 0.3});'
        )
    anim_parts.append(
        f'tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});'
    )
    return css, content, "\n      ".join(anim_parts)


def quote(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene["eyebrow"]
    quote_text = scene["quote"]
    attribution = scene["attribution"]
    sub = scene.get("sub", "")

    css = f"""
      #scene1 .scene-content {{ align-items: center; text-align: center; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
        margin-bottom: 24px;
      }}
      #scene1 .{sid}-quote-text {{
        font-size: 96px; color: var(--fg);
        max-width: 1500px; line-height: 1.1;
        font-style: italic; font-weight: 300;
      }}
      #scene1 .{sid}-quote-text .accent {{ color: var(--accent); }}
      #scene1 .{sid}-attribution {{
        font-family: "JetBrains Mono", monospace;
        font-size: 32px; color: var(--accent);
        letter-spacing: 0.2em; text-transform: uppercase;
        margin-top: 48px;
      }}
      #scene1 .{sid}-sub {{
        font-size: 32px; color: var(--muted);
        max-width: 1100px; margin-top: 24px;
        letter-spacing: 0.05em;
      }}
    """
    sub_html = f'<p class="sub {sid}-sub">{sub}</p>' if sub else ""
    content = f"""
      <div class="eyebrow {sid}-eyebrow">{eyebrow}</div>
      <h2 class="display {sid}-quote-text">{quote_text}</h2>
      <div class="{sid}-attribution">{attribution}</div>
      {sub_html}
    """
    anim = f"""
      gsap.set(".{sid}-eyebrow", {{ y: -20, opacity: 0 }});
      gsap.set(".{sid}-quote-text", {{ y: 40, opacity: 0, scale: 0.95 }});
      gsap.set(".{sid}-attribution", {{ y: 20, opacity: 0 }});
      gsap.set(".{sid}-sub", {{ y: 20, opacity: 0 }});
      tl.to(".{sid}-eyebrow", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 0.3);
      tl.to(".{sid}-quote-text", {{ y: 0, opacity: 1, scale: 1, duration: 1.0, ease: "expo.out" }}, 0.7);
      tl.to(".{sid}-attribution", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 1.8);
      tl.to(".{sid}-sub", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 2.4);
      tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});
    """
    return css, content, anim


def list(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene["eyebrow"]
    headline = scene["headline"]
    items = scene["items"]
    sub = scene.get("sub", "")

    css = f"""
      #scene1 .scene-content {{ padding: 0 120px; align-items: stretch; }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
        margin-bottom: 12px;
      }}
      #scene1 .{sid}-headline {{ font-size: 120px; color: var(--fg); margin-bottom: 24px; }}
      #scene1 .{sid}-sub {{ font-size: 32px; color: var(--fg); max-width: 1100px; margin-bottom: 24px; }}
      #scene1 .{sid}-items {{
        display: flex; flex-direction: column; gap: 18px;
      }}
      #scene1 .{sid}-item {{
        display: flex; align-items: center; gap: 24px;
        padding: 18px 28px;
        background: rgba(255,255,255,0.03);
        border-left: 4px solid var(--accent);
        font-size: 36px; color: var(--fg);
      }}
      #scene1 .{sid}-item .num {{
        font-family: "JetBrains Mono", monospace;
        font-size: 28px; color: var(--accent);
        min-width: 60px;
      }}
    """
    items_html = "".join(
        f'<div class="{sid}-item" data-i="{i}"><span class="num">{i+1:02d}</span><span>{item}</span></div>'
        for i, item in enumerate(items)
    )
    sub_html = f'<p class="sub {sid}-sub">{sub}</p>' if sub else ""
    content = f"""
      <div class="eyebrow {sid}-eyebrow">{eyebrow}</div>
      <h2 class="display headline {sid}-headline">{headline}</h2>
      {sub_html}
      <div class="{sid}-items">{items_html}</div>
    """
    anim_parts = [
        f'gsap.set(".{sid}-eyebrow", {{ y: -20, opacity: 0 }});',
        f'gsap.set(".{sid}-headline", {{ y: 60, opacity: 0 }});',
    ]
    for i in range(len(items)):
        anim_parts.append(f'gsap.set("[data-i=\\"{i}\\"]", {{ x: 60, opacity: 0 }});')
    anim_parts.append(
        f'tl.to(".{sid}-eyebrow", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 0.3);'
    )
    anim_parts.append(
        f'tl.to(".{sid}-headline", {{ y: 0, opacity: 1, duration: 0.7, ease: "expo.out" }}, 0.6);'
    )
    for i in range(len(items)):
        anim_parts.append(
            f'tl.to("[data-i=\\"{i}\\"]", {{ x: 0, opacity: 1, duration: 0.4, ease: "back.out(1.4)" }}, {1.4 + i * 0.25});'
        )
    anim_parts.append(
        f'tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});'
    )
    return css, content, "\n      ".join(anim_parts)


def split(scene: dict) -> tuple[str, str, str]:
    sid = cls(scene["id"])
    eyebrow = scene["eyebrow"]
    headline = scene["headline"]
    body = scene["body"]
    image_query = scene["image_query"]

    css = f"""
      #scene1 .scene-content {{ padding: 0 120px; flex-direction: row; align-items: stretch; gap: 80px; }}
      #scene1 .{sid}-left {{ flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 32px; }}
      #scene1 .{sid}-right {{
        flex: 0 0 720px; display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--rule);
        padding: 40px;
      }}
      #scene1 .{sid}-eyebrow {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--accent);
        letter-spacing: 0.4em; text-transform: uppercase;
      }}
      #scene1 .{sid}-headline {{ font-size: 130px; color: var(--fg); }}
      #scene1 .{sid}-body {{ font-size: 36px; color: var(--fg); line-height: 1.4; max-width: 720px; }}
      #scene1 .{sid}-image-note {{
        font-family: "JetBrains Mono", monospace;
        font-size: 22px; color: var(--muted);
        letter-spacing: 0.1em; text-transform: uppercase;
        text-align: center;
      }}
    """
    content = f"""
      <div class="{sid}-left">
        <div class="eyebrow {sid}-eyebrow">{eyebrow}</div>
        <h2 class="display headline {sid}-headline">{headline}</h2>
        <p class="body {sid}-body">{body}</p>
      </div>
      <div class="{sid}-right">
        <div class="{sid}-image-note">// STILL: {image_query}</div>
      </div>
    """
    anim = f"""
      gsap.set(".{sid}-eyebrow", {{ x: -40, opacity: 0 }});
      gsap.set(".{sid}-headline", {{ y: 60, opacity: 0 }});
      gsap.set(".{sid}-body", {{ y: 30, opacity: 0 }});
      gsap.set(".{sid}-right", {{ scale: 0.9, opacity: 0 }});
      tl.to(".{sid}-eyebrow", {{ x: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 0.3);
      tl.to(".{sid}-headline", {{ y: 0, opacity: 1, duration: 0.7, ease: "expo.out" }}, 0.6);
      tl.to(".{sid}-body", {{ y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }}, 1.3);
      tl.to(".{sid}-right", {{ scale: 1, opacity: 1, duration: 0.8, ease: "expo.out" }}, 1.0);
      tl.to("#scene1 .scene-content > *", {{ opacity: 0, duration: 0.4 }}, {scene["duration_s"] - 0.6});
    """
    return css, content, anim


# ─────────────────────────────────────────────────────────────────────
# Dispatch
# ─────────────────────────────────────────────────────────────────────
RENDERERS = {
    "hook": hook,
    "scale": scale,
    "portrait": portrait,
    "record": record,
    "grid": grid,
    "quote": quote,
    "list": list,
    "split": split,
}


def render_kind(scene: dict) -> tuple[str, str, str, str]:
    """Return (css, content, anim, subtitle_html) for a given scene."""
    kind = scene["kind"]
    if kind not in RENDERERS:
        raise ValueError(f"unknown kind {kind!r}")
    css, content, anim = RENDERERS[kind](scene)
    css = css + _aspect_layout_css(scene)
    sub_css, sub_html, sub_anim = _kinetic_subtitles(scene)
    if sub_css:
        css = css + sub_css
    if sub_anim:
        anim = anim + "\n      " + sub_anim
    return css, content, anim, sub_html
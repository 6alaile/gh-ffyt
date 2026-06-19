# MD2YT — Markdown-to-YouTube faceless video factory

MD2YT is a general-purpose pipeline that turns a JSON spec into a 1920×1080 30 fps
MP4 and optionally publishes it to YouTube. The first spec is the 2026
FIFA World Cup explainer; new specs need zero code changes.

The project is named **MD2YT** (Markdown → YouTube) and installs as a single
console binary, **`md2yt`**, that drives the whole pipeline.

```
specs/<name>.json  ──►  md2yt compose
                              │
                              ├─ fetch stock footage (Pixabay → Pexels)
                              ├─ voiceover per scene (Edge TTS default, ElevenLabs optional)
                              ├─ render per-scene HTML (resources/base.html + per-kind CSS)
                              ├─ npx hyperframes render (per scene)
                              └─ ffmpeg xfade concat
                                          │
                                          ▼
                          build/<id>/<id>.mp4   ──►  md2yt upload
                                                       │
                                                       ▼
                                                 YouTube Data API v3
```

API keys and OAuth tokens live in **Settings → Secrets**; never in code.

---

## What is in this repo

| Path | Purpose |
|---|---|
| `pyproject.toml` | Package metadata + console script (`md2yt = pipeline.cli:main`) + deps. |
| `src/pipeline/` | Installable Python package. The `md2yt` binary lives here. |
| `src/pipeline/cli.py` | Argparse subcommand dispatcher (`compose`, `validate`, `upload`, `brief`). |
| `src/pipeline/schema.py` | JSON validator for specs. Loud on errors. |
| `src/pipeline/renderers.py` | Per-kind (8 kinds) CSS + content + GSAP animations. |
| `src/pipeline/fetchers.py` | Pixabay + Pexels video search. |
| `src/pipeline/voiceover.py` | Edge TTS (default) + ElevenLabs (dormant). |
| `src/pipeline/compose.py` | The orchestrator. Wires fetch → TTS → HTML → HyperFrames → xfade. |
| `src/pipeline/upload.py` | Spec-driven YouTube uploader. |
| `src/pipeline/brief.py` | Optional: parse a `.md` content brief into a draft spec. |
| `src/pipeline/config.py` | Env-var hub (one module owns every `os.environ` read). |
| `src/pipeline/resources/base.html` | Shared HTML shell: palette, fonts, top/bottom bars, vignette. |
| `src/pipeline/resources/fonts/*.woff2` | Bundled fonts (Anton, Manrope, JetBrains Mono, Arial Narrow). |
| `specs/*.json` | One spec per video. JSON, validated, fully describes the video. |
| `tests/` | Pytest suite — mirrors `src/pipeline/`. |
| `docs/` | Long-form documentation (placeholder; populated as the project grows). |
| `.github/workflows/render-and-upload.yml` | CI: per-spec render + optional upload. |

> **Status (2026-06-18):** `md2yt` is the only entry point. The
> `scripts/`, `templates/`, `hf/` directories and `requirements.txt` were
> retired (parked in `tmp/`); the `src/pipeline/` package is the source
> of truth. `pip install -e .[dev]` exposes the binary; tests live
> under `tests/`.

---

## Write a spec

A spec has three top-level sections: `id`, `youtube`, `scenes`.
Optional: `tts` (ElevenLabs overrides), `palette` (re-skin).

```json
{
  "id": "my_video",
  "youtube": {
    "title": "...",
    "description": "...",
    "tags": ["..."],
    "privacy": "private",
    "category_id": "17"
  },
  "scenes": [
    { "id": "01_hook", "kind": "hook",   "duration_s": 6, "script": "...",
      "eyebrow": "...", "headline": "...", "subhead": "..." },
    { "id": "02_scale", "kind": "scale", "duration_s": 12, "script": "...",
      "headline": "...", "stats": [{"num":"48","label":"NATIONS"}, ...] }
    // ... one entry per scene
  ]
}
```

### The 8 scene kinds

| Kind | Required fields | Vibe |
|---|---|---|
| `hook` | `eyebrow`, `headline` (use `<accent>…</accent>` for the gold word), `subhead` | Big opening slam |
| `scale` | `headline`, `stats` (list of `{num,label}`) | Numbers wall |
| `portrait` | `eyebrow`, `headline`, `names` (list of `{name,year}`) | Two (or more) faces |
| `record` | `counter_label`, `counter_num`, `counter_suffix`, `name` | One big counter |
| `grid` | `headline`, `cards` (list of `{flag,name,stats,quote}`) | 3-4 host cards |
| `quote` | `eyebrow`, `quote` (use `<accent>…</accent>` for the gold word), `attribution` | One big quote |
| `list` | `eyebrow`, `headline`, `items` (list of strings) | Numbered list |
| `split` | `eyebrow`, `headline`, `body`, `image_query` | Two-column text + image |

See `specs/_example.json` for a minimal reference spec that uses every
kind, and `specs/world_cup_2026.json` for the full reference implementation.

Common per-scene fields (all kinds): `source` (`pixabay` | `pexels`),
`query` (search string), `min_width`, `top_label`, `bottom_label`, `pill`.

### Multi-line voiceover

Embed `\n` for newlines in the `script` field. JSON strings handle this
naturally:

```json
"script": "Line one.\nLine two.\nLine three."
```

---

## Install

MD2YT is a regular Python package. Install it editable (so `md2yt` is
on your `PATH` and points at your working copy):

```bash
# Runtime deps only:
pip install -e .

# Or, with the test/dev extras:
pip install -e .[dev]
```

Python 3.11 or newer is required. `npx` (Node ≥ 22) and `ffmpeg` must be
on `PATH` — install Node from nodejs.org and `ffmpeg` via your OS
package manager (e.g. `apt-get install -y ffmpeg` on Debian/Ubuntu,
`brew install ffmpeg` on macOS).

---

## Run locally

```bash
# 1. Set the API keys you need. The most common ones:
export PIXABAY_API_KEY=...     # primary footage source
export PEXELS_API_KEY=...      # fallback footage source
export ELEVENLABS_API_KEY=...  # optional (dormant by default)
export ELEVENLABS_VOICE_ID=... # optional (dormant by default)

# 2. Validate the spec
md2yt validate --spec specs/world_cup_2026.json
# OK: specs/world_cup_2026.json validates

# 3. Render the video
md2yt compose --spec specs/world_cup_2026.json --output-dir build
# Final MP4: build/world_cup_2026/world_cup_2026.mp4

# 4. (Optional) upload to YouTube. See YOUTUBE_SETUP.md for the one-time
#    OAuth + base64-secrets wiring.
md2yt upload --spec specs/world_cup_2026.json
```

### Turning `TTS_ALLOW_ELEVENLABS` on

Edge TTS is the default and needs no key. To switch to ElevenLabs, set
`TTS_ALLOW_ELEVENLABS=1` in the env, then install the optional
`elevenlabs` extra and export `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`.

### Other subcommands

```
md2yt brief     --help
md2yt brief     --input content_brief.md --output specs/_draft.json
```

---

## Write a spec from a markdown content brief

If you start from prose, the converter turns a structured `.md` brief into
a draft spec you can edit. See `md2yt brief --help` for the documented
schema. Quick example:

```bash
md2yt brief --input example_brief.md --output specs/_draft.json
# Reads brief, writes draft spec, prints which fields it filled.
```

The converter is rule-based: it only fills fields it can recognise
unambiguously. Everything else is left as `TODO` for you to fill in.

---

## GitHub Actions

| Event | What happens |
|---|---|
| Push to `main` | Render + upload (with `YT_PRIVACY_STATUS`) |
| Push tag `v*` | Render + upload, 365-day artifact retention |
| Pull request to `main` | Render only, no upload; PR preview artifact for 14 days |
| `workflow_dispatch` | Manual, with `spec` dropdown + `skip_upload` + `privacy_status` |

The `meta` job discovers every `specs/*.json` (except `_example.json`)
and exposes them as the dispatch dropdown options. So adding a new
spec to the repo automatically adds it to the manual UI.

Render step: ~16 min for an 8-scene video. Upload: a few more. Total
job time: 18–25 min for upload-included runs.

### Required secrets

| Secret | Why |
|---|---|
| `PIXABAY_API_KEY` | Primary footage source |
| `PEXELS_API_KEY` | Fallback footage source |
| `ELEVENLABS_API_KEY` | Voiceover (dormant unless `TTS_ALLOW_ELEVENLABS=1`) |
| `ELEVENLABS_VOICE_ID` | Voiceover (dormant unless `TTS_ALLOW_ELEVENLABS=1`) |
| `YT_CLIENT_SECRETS_BASE64` | YouTube publish |
| `YT_TOKEN_PICKLE_BASE64` | YouTube publish |
| `YT_PRIVACY_STATUS` | Optional default privacy |
| `YT_THUMBNAIL_PATH` | Optional thumbnail |
| `YT_CAPTIONS_PATH` | Optional captions.srt |

For YouTube OAuth you need a **"Desktop app"** client, not a Web
application client. Run `md2yt upload` once locally to complete the
consent flow and generate `youtube_token.pickle`. Base64-encode both
files (`base64 -w0 … > .b64`) and paste the contents as the matching
secret. See `YOUTUBE_SETUP.md` for the full procedure.

---

## Adding a new scene kind

1. Add it to `SCENE_KINDS` and `KIND_SCHEMAS` in `src/pipeline/schema.py`.
2. Add a renderer in `src/pipeline/renderers.py` (CSS + HTML + GSAP).
3. Add a kind-specific section in `src/pipeline/resources/base.html` (if needed).
4. Add a row to the "8 scene kinds" table in this README.

---

## Architecture

```
specs/<id>.json
   ├─ schema.py validates
   ├─ fetchers.py: pixabay → pexels (fallback) → download → reencode
   ├─ voiceover.py: edge-tts (default) / elevenlabs (dormant)
   ├─ renderers.py + resources/base.html → per-scene HTML
   ├─ npx hyperframes render (per scene)
   └─ ffmpeg xfade concat
                                          │
                                          ▼
              build/<id>/<id>.mp4
                                          │
                                          ▼
              upload.py → YouTube Data API v3
```

Per-scene renders replace the original master composition. The trade-off:
no cross-scene GSAP transitions (zoom-fade, chromatic split, shutter,
focus pull, etc.). Mitigated by a 0.3 s xfade between every scene pair.
If a v2 brings back the master composition, set `--xfade 0` in the
composer.

---

## Configuration

Every environment variable is read by exactly one module —
`src/pipeline/config.py`. If you want to know which knobs exist and
what they default to, read that file. If you want to add a new knob,
add it there.

The config surface is grouped into five dataclasses:

| Dataclass | Reads |
|---|---|
| `FootageKeys` | `PIXABAY_API_KEY`, `PEXELS_API_KEY` |
| `TTSConfig` | `EDGE_TTS_VOICE`, `EDGE_TTS_RATE`, `EDGE_TTS_VOLUME`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `TTS_ALLOW_ELEVENLABS` |
| `RenderConfig` | `RENDER_PARALLEL` |
| `YouTubeSecrets` | `YT_CLIENT_SECRETS_BASE64`, `YT_TOKEN_PICKLE_BASE64` |
| `YouTubeDefaults` | `YT_PRIVACY_STATUS`, `YT_THUMBNAIL_PATH`, `YT_CAPTIONS_PATH`, `YT_SPEC_PATH`, `VIDEO_FILE` |

The dataclasses are constructed with `from_env()` in their respective
consumer modules — there is no global config object.

---

## License

UNLICENSED — see `LICENSE`. Private repo.

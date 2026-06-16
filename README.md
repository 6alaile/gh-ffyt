# gh-ffyt — World Cup 2026 faceless video pipeline

A 2:48 cinematic explainer about the 2026 FIFA World Cup, produced from a
single HyperFrames HTML composition (`hf/index.html`) and rendered headlessly
on GitHub Actions. The same workflow can publish the result to YouTube.

```
hf/index.html (GSAP composition)
   -> HyperFrames CLI (npx hyperframes render)
   -> world_cup_video_01_FINAL_v2.mp4 (1920x1080, 30fps, ~168s)
   -> YouTube Data API v3 (scripts/upload_to_youtube.py)
```

All API keys and OAuth tokens live in **Settings -> Secrets**, never in code.

---

## Prerequisites

You only need these if you want to **regenerate** the assets locally; the
default render flow does not call out to any third-party API.

| Service | Why | Where to get it |
|---|---|---|
| Pexels | Stock-footage clips (only if you re-run `produce_video_01.py`) | <https://pexels.com/api> |
| ElevenLabs | AI voiceover (only if you re-run `generate_voiceover.py`) | <https://elevenlabs.io> |
| Google Cloud | YouTube Data API v3 (only if you want to publish) | <https://console.cloud.google.com> |

For the YouTube OAuth flow you specifically need a **"Desktop app" OAuth
client**, not a "Web application" one.

---

## One-time local setup

### 1. Render locally (no secrets required)

```bash
pip install -r requirements.txt
npx hyperframes preview hf           # interactive browser preview
npx hyperframes render hf \
  --output world_cup_video_01_FINAL_v2.mp4 --quality high
```

This produces the same MP4 that CI produces, using the assets already
committed under `hf/assets/`.

### 2. (Optional) Re-run the legacy Pexels asset pipeline

```bash
export PEXELS_API_KEY=your-key
python scripts/produce_video_01.py
```

The script writes its legacy concat build into `video_01_assets/` (gitignored).
The HyperFrames render is the real final video and does not need this step.

### 3. (Optional) Regenerate the voiceover

```bash
export ELEVENLABS_API_KEY=...
export ELEVENLABS_VOICE_ID=...   # elevenlabs.io -> Voices -> My Voices
python scripts/generate_voiceover.py
```

### 4. (Optional) Set up YouTube publishing

1. Google Cloud Console -> your project -> **Enable YouTube Data API v3**.
2. **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID ->
   Application type: Desktop app** -> Download JSON -> save as
   `client_secrets.json` in the repo root (gitignored).
3. Run the uploader once locally to do the browser consent flow and create
   `youtube_token.pickle` (gitignored):

   ```bash
   pip install -r requirements.txt
   python scripts/upload_to_youtube.py
   ```

   A browser tab opens, you sign in, the script writes the refresh token to
   `youtube_token.pickle`.
4. Base64-encode both files for CI:

   ```bash
   base64 -w0 client_secrets.json   > client_secrets.b64
   base64 -w0 youtube_token.pickle  > youtube_token.b64
   ```

---

## Setting GitHub repo secrets

Repo -> **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret | Required for | Value |
|---|---|---|
| `PEXELS_API_KEY` | Local re-gen of Pexels clips (not used in CI render) | Your Pexels key |
| `ELEVENLABS_API_KEY` | Local re-gen of voiceover (not used in CI render) | Your ElevenLabs key |
| `ELEVENLABS_VOICE_ID` | Same as above | ElevenLabs voice id |
| `YT_CLIENT_SECRETS_BASE64` | YouTube publish step | Paste contents of `client_secrets.b64` |
| `YT_TOKEN_PICKLE_BASE64` | YouTube publish step | Paste contents of `youtube_token.b64` |
| `YT_PRIVACY_STATUS` | Optional | `public` \| `unlisted` \| `private` (default: `private`) |
| `YT_THUMBNAIL_PATH` | Optional | Path to a `thumbnail.jpg` to set after upload |
| `YT_CAPTIONS_PATH` | Optional | Path to a `captions.srt` to attach |

---

## Triggering the workflow

| Event | What happens |
|---|---|
| Push to `main` | Render + upload (with `YT_PRIVACY_STATUS`) |
| Push tag `v*` | Render + upload, artifact retained 365 days |
| Pull request to `main` | Render only, no upload; PR preview artifact for 14 days |
| `workflow_dispatch` (Actions tab) | Manual, with optional `skip_upload` and `privacy_status` inputs |

The render step typically takes 12-18 minutes; the upload step a few more.
Total job time: 18-25 min for upload-included runs.

---

## Regenerating assets

If you want a fresh voiceover or fresh stock footage (e.g. after a Pexels
clip is taken down), run the scripts locally with the env vars set and
commit the new files under `hf/assets/`. The CI workflow does not
regenerate assets — it only renders the HTML composition against the
committed assets.

After replacing clips, run `python scripts/reencode_clips.py` once to
enforce a 1-second GOP, which silences HyperFrames' "sparse keyframes"
warning and makes random-access snappy.

---

## Architecture

```
hf/index.html (GSAP composition)
        |
        | npx hyperframes render
        v
world_cup_video_01_FINAL_v2.mp4
        |
        | python scripts/upload_to_youtube.py
        v
    YouTube Data API v3
```

Pexels and ElevenLabs feed the assets that are committed to the repo. The
workflow only renders + uploads.

---

## License

UNLICENSED — see `LICENSE`.

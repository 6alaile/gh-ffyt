# MD2YT Project: Open Items & Roadmap

**Last Updated:** September 7, 2026 14:18 UTC  
**Status:** End-to-end pipeline operational  
**Current Branch:** `dev`  
**Production URL:** https://ghffyt-dev-branch.vercel.app/

---

## 🚨 Critical Path Items

### 1. Dashboard Real-Time Integration
**Status:** 🔴 Blocked  
**Priority:** P0 (High)  
**Effort:** 2-3 hours

**Current State:**
- `/history` page exists but shows placeholder data
- No connection to GitHub Actions API
- No real-time render status updates

**Required Work:**
1. Implement GitHub Actions API client (`web/lib/github-actions.ts`)
   ```typescript
   // Fetch workflow runs
   GET /repos/:owner/:repo/actions/runs
   
   // Fetch run artifacts
   GET /repos/:owner/:repo/actions/runs/:run_id/artifacts
   
   // Download artifact
   GET /repos/:owner/:repo/actions/artifacts/:artifact_id/zip
   ```

2. Wire `/history` page to live data:
   - Poll workflow runs every 10s during active renders
   - Display status: queued → in_progress → completed → failed
   - Show duration, commit SHA, branch

3. Add artifact download buttons:
   - "Download MP4" (extracts from artifact zip)
   - "Download SRT" (captions file)
   - "View Logs" (links to Actions run page)

**Acceptance Criteria:**
- [ ] Real workflow runs appear in `/history` within 10s of dispatch
- [ ] Status updates reflect actual Actions runner state
- [ ] MP4 downloads successfully from completed runs
- [ ] Error runs show failure reason and logs link

---

### 2. Error Monitoring & Alerting
**Status:** 🟡 Missing  
**Priority:** P0 (High)  
**Effort:** 1 hour

**Current State:**
- No centralized error tracking
- LLM failures logged to console only
- Render failures invisible until user checks Actions page

**Required Work:**
1. **Integrate Sentry** (recommended):
   ```bash
   npm install @sentry/nextjs
   npx @sentry/wizard -i nextjs
   ```
   - Configure DSN in Vercel env vars
   - Wrap API routes with error boundaries
   - Tag errors by source: `llm_generation`, `github_upload`, `workflow_dispatch`

2. **Add Vercel Analytics**:
   - Enable in Vercel dashboard (zero config)
   - Track `/api/brief` latency
   - Monitor OpenRouter API response times

3. **Python Pipeline Logging**:
   - Structured JSON logs in GitHub Actions
   - Parse errors in `/api/status` endpoint
   - Surface in web UI (e.g., "Stock footage failed for scene 3")

**Acceptance Criteria:**
- [ ] All API errors reported to Sentry within 30s
- [ ] LLM timeout/failure alerts sent to Slack/email
- [ ] GitHub Actions failures trigger notification
- [ ] Dashboard shows error summary with retry button

---

### 3. Evidence Grounding Integration
**Status:** 🟡 Module exists, not integrated  
**Priority:** P1 (Medium-High)  
**Effort:** 4-5 hours

**Current State:**
- `src/pipeline/evidence.py` module complete with validation
- `web/lib/research/` bundles implemented (Reddit, FBref, Transfermarkt)
- LLM prompt does NOT receive source bundles
- Voiceover scripts contain unverified claims (e.g., invented stats)

**Required Work:**

1. **Research Bundle Generation** (`web/lib/research/bundles.ts`):
   ```typescript
   // Before calling /api/brief:
   const bundle = await fetchResearchBundle({
     teams: formData.teams,
     matchDate: formData.matchDate,
     bundleKind: "reddit" // or "fbref"
   });
   
   // Returns:
   {
     snapshot_id: "ev_reddit_a3b4c5d6...",
     sources: [
       { id: "reddit_thread_xyz", url: "...", text: "..." },
       { id: "rss_article_abc", url: "...", text: "..." }
     ]
   }
   ```

2. **LLM Prompt Enhancement** (`web/app/api/brief/route.ts`):
   ```typescript
   const systemPrompt = `...
   
   EVIDENCE REQUIREMENTS:
   You have been provided with source material. For every factual claim (stats, scores, player names, dates):
   - Cite the source ID in brackets: [reddit_thread_xyz]
   - Do NOT invent statistics or facts
   - If a claim is inferred but not directly stated, mark it: [INFERRED from reddit_thread_xyz]
   - If no source supports a claim you want to make, mark it: [REQUIRES VERIFICATION]
   
   SOURCE BUNDLE:
   ${JSON.stringify(bundle.sources, null, 2)}
   ...`;
   ```

3. **Validation Step** (after LLM generation):
   ```typescript
   import { validateClaims } from '@/lib/evidence';
   
   const claims = extractClaimsFromMarkdown(llmOutput);
   validateClaims(
     claims,
     bundle.sources.map(s => s.id),
     bundle.snapshot_id
   );
   // Throws EvidenceError if claim cites non-existent source
   ```

4. **UI Display**:
   - Show cited sources in review step
   - Highlight `[REQUIRES VERIFICATION]` claims in red
   - Add "Re-generate with verified facts only" button

**Acceptance Criteria:**
- [ ] LLM output includes `[source_id]` citations for all stats
- [ ] Brief parser extracts claims and validates sources
- [ ] Review UI shows source links next to claims
- [ ] Unverified claims blocked from render dispatch

---

## 🎯 High-Value Features

### 4. Stock Footage Quality Improvements
**Status:** 🔴 Poor match quality  
**Priority:** P1 (Medium-High)  
**Effort:** 3-4 hours

**Problem:**
- Generic queries like "football stadium crowd" return irrelevant clips
- No semantic understanding of context (e.g., "Hull City home crowd" → wrong stadium)
- Pixabay/Pexels APIs return first 5 results, often low quality

**Solutions:**

**Option A: Query Refinement** (Quick win, 1 hour):
```python
# src/pipeline/fetchers.py
def _build_smart_query(scene: dict, spec: dict) -> str:
    base_query = scene.get("query", "football match")
    teams = spec.get("youtube", {}).get("title", "")
    
    # Extract team names from title
    if "vs" in teams.lower():
        team_a, team_b = teams.split("vs")
        base_query += f" {team_a.strip()} {team_b.strip()}"
    
    # Add scene context
    if scene["kind"] == "record":
        base_query += " celebration goal scored"
    elif scene["kind"] == "split":
        base_query += " tactical analysis graphics"
    
    return base_query
```

**Option B: Semantic Search** (Better quality, 3 hours):
1. Use OpenAI Embeddings API to encode:
   - Scene query + script
   - Pexels/Pixabay video metadata (title + description)
2. Compute cosine similarity
3. Return top 3 matches instead of first 3 results

**Option C: Match Highlight Extraction** (Best quality, 6+ hours):
1. Scrape YouTube for match highlights
2. Use Whisper to detect goal/foul timestamps
3. Extract 5-10s clips via ffmpeg
4. Store in local cache (not feasible on Vercel, needs S3/storage)

**Recommendation:** Start with Option A (query refinement), measure quality improvement, then invest in Option B if needed.

**Acceptance Criteria:**
- [ ] 80%+ of fetched clips visually relevant to scene context
- [ ] No generic "football field" clips in "celebration" scenes
- [ ] Team-specific queries when team names available

---

### 5. Aspect Ratio Live Preview
**Status:** 🟡 No visual feedback  
**Priority:** P2 (Medium)  
**Effort:** 2 hours

**Current State:**
- User selects 16:9 or 9:16 blindly
- No preview of how layout changes

**Required Work:**

1. **Preview Component** (`web/components/AspectPreview.tsx`):
   ```tsx
   export function AspectPreview({ 
     aspectRatio 
   }: { 
     aspectRatio: "16:9" | "9:16" 
   }) {
     const is169 = aspectRatio === "16:9";
     
     return (
       <div className={`preview-frame ${is169 ? 'horizontal' : 'vertical'}`}>
         <div className="scene-mock hook">
           <div className="top-bar">● LIVE</div>
           <div className="content">
             <h1>THE <span className="accent">COLLAPSE</span></h1>
           </div>
           <div className="bottom-bar">TACTICAL ANALYSIS</div>
         </div>
       </div>
     );
   }
   ```

2. **CSS Aspect Ratio Containers**:
   ```css
   .preview-frame.horizontal {
     aspect-ratio: 16 / 9;
     max-width: 400px;
   }
   
   .preview-frame.vertical {
     aspect-ratio: 9 / 16;
     max-width: 225px;
   }
   ```

3. **Integration**:
   - Show preview next to aspect ratio selector
   - Update in real-time when user toggles

**Acceptance Criteria:**
- [ ] Preview updates instantly on aspect ratio change
- [ ] Shows representative layout of Hook scene
- [ ] Indicates text size/spacing differences

---

### 6. Voiceover Pacing Controls
**Status:** 🟡 Fixed duration mismatch  
**Priority:** P2 (Medium)  
**Effort:** 3 hours

**Problem:**
- TTS audio length often mismatches scene duration estimate
- `entrance_scale()` compresses animations, but may feel rushed
- No user control over pacing

**Solutions:**

1. **Post-Generation Editing** (web/app/new-video/page.tsx):
   - After LLM brief generation, run TTS preview for each scene
   - Show actual audio duration vs. estimated duration
   - Let user edit voiceover script and re-generate TTS
   - Update brief markdown with new script + duration

2. **Pacing Presets**:
   ```typescript
   enum VoiceoverPacing {
     SLOW = 120,     // words per minute
     NORMAL = 150,
     FAST = 180
   }
   ```
   - LLM prompt includes: `Write voiceover at ${pacing} WPM`
   - Edge TTS `rate` parameter: `-20%` (slow) / `+0%` (normal) / `+20%` (fast)

3. **Duration Enforcement**:
   ```typescript
   // In LLM prompt:
   `Scene ${i} voiceover MUST be ${duration}s or less when spoken aloud.
   Aim for ${Math.floor(duration * 2.5)} words.`
   ```

**Acceptance Criteria:**
- [ ] User sees TTS preview durations in review step
- [ ] Can adjust pacing preset (slow/normal/fast)
- [ ] Re-generate voiceover without regenerating entire brief
- [ ] Final rendered scene duration matches audio ±0.5s

---

## 🔧 Technical Debt

### 7. Parallel Scene Rendering
**Status:** 🟡 Sequential rendering (slow)  
**Priority:** P2 (Medium)  
**Effort:** 2 hours

**Current State:**
- `src/pipeline/compose.py` renders scenes sequentially
- 6 scenes × 40s each = 4 minutes wasted
- GitHub Actions runner has 2-4 CPU cores unused

**Solution:**

```python
# src/pipeline/compose.py:509-526 (already uses ThreadPoolExecutor!)
# Just increase max_workers:

max_parallel = max(1, min(render_cfg.parallel, len(render_jobs)))
# render_cfg.parallel defaults to 3

# Increase default in src/pipeline/config.py:
@dataclass
class RenderConfig:
    parallel: int = field(default=6)  # was 3
```

**Risk:** Headless Chrome memory usage scales linearly with parallel instances. GitHub Actions runner has ~7GB RAM. 6 Chrome instances × 1GB each = 6GB (safe). Monitor for OOM kills.

**Acceptance Criteria:**
- [ ] 6-scene video renders in <3 minutes (vs. 4-5 minutes)
- [ ] No OOM errors in GitHub Actions logs
- [ ] CPU usage >80% during render phase

---

### 8. E2E Test Suite
**Status:** 🔴 Missing  
**Priority:** P2 (Medium)  
**Effort:** 4-5 hours

**Current State:**
- No automated testing beyond unit tests
- Manual verification only
- Regression risk on every deploy

**Required Work:**

1. **Install Playwright**:
   ```bash
   cd web
   npm install -D @playwright/test
   npx playwright install
   ```

2. **Write Tests** (`web/tests/e2e/new-video.spec.ts`):
   ```typescript
   test('create video from research mode', async ({ page }) => {
     await page.goto('/new-video');
     
     // Fill form
     await page.selectOption('[name="mode"]', 'research');
     await page.fill('[name="matchTitle"]', 'Test Match');
     await page.fill('[name="teams"]', 'Team A, Team B');
     await page.fill('[name="keyMoments"]', 'Test moment');
     
     // Submit
     await page.click('button[type="submit"]');
     
     // Wait for LLM generation
     await page.waitForSelector('textarea', { timeout: 10000 });
     
     // Verify markdown contains scenes
     const markdown = await page.inputValue('textarea');
     expect(markdown).toContain('## Hook');
     expect(markdown).toContain('## Scene 1');
     
     // Dispatch render
     await page.click('text=Approve & Dispatch');
     
     // Verify redirect to success page
     await expect(page).toHaveURL(/dispatched/);
   });
   ```

3. **Mock APIs** (avoid hitting OpenRouter in tests):
   ```typescript
   await page.route('**/api/brief', route => {
     route.fulfill({
       status: 200,
       body: JSON.stringify({ 
         briefId: 'test123',
         markdown: MOCK_BRIEF_MARKDOWN 
       })
     });
   });
   ```

4. **CI Integration** (`.github/workflows/test.yml`):
   ```yaml
   name: E2E Tests
   on: [push, pull_request]
   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm ci
         - run: npx playwright install --with-deps
         - run: npm run test:e2e
   ```

**Acceptance Criteria:**
- [ ] Test suite runs in <2 minutes
- [ ] Covers: form submission, LLM generation, review step, dispatch
- [ ] Fails loudly on regression
- [ ] Runs on every PR

---

### 9. TypeScript Strict Mode Violations
**Status:** 🟢 Clean (verified)  
**Priority:** P3 (Low)  
**Effort:** 0 hours (already done)

**Verified:**
```bash
cd web
npx tsc --noEmit
# ✅ No errors
```

No action required.

---

### 10. Python Type Annotations
**Status:** 🟡 Partial coverage  
**Priority:** P3 (Low)  
**Effort:** 2 hours

**Current State:**
- `src/pipeline/` modules use type hints inconsistently
- No `mypy` validation in CI

**Solution:**

1. **Add mypy to CI**:
   ```yaml
   # .github/workflows/test.yml
   - name: Type check Python
     run: |
       pip install mypy
       mypy src/pipeline/ --strict
   ```

2. **Fix type errors**:
   - Add return types to all functions
   - Annotate `dict[str, Any]` → proper TypedDict where possible
   - Fix `Optional` vs. `| None` inconsistencies

**Acceptance Criteria:**
- [ ] `mypy --strict` passes with zero errors
- [ ] CI fails on type regressions

---

## 🚀 Future Enhancements

### 11. YouTube Auto-Upload
**Status:** 🔴 Not started  
**Priority:** P3 (Low)  
**Effort:** 6-8 hours

**Required Work:**
1. Google Cloud Console setup:
   - Create OAuth 2.0 client ID
   - Enable YouTube Data API v3
   - Add `https://ghffyt-dev-branch.vercel.app/auth/callback` to redirect URIs

2. OAuth Flow (`web/app/api/youtube/auth/route.ts`):
   ```typescript
   import { google } from 'googleapis';
   
   const oauth2Client = new google.auth.OAuth2(
     process.env.GOOGLE_CLIENT_ID,
     process.env.GOOGLE_CLIENT_SECRET,
     process.env.GOOGLE_REDIRECT_URI
   );
   
   // Generate auth URL
   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: ['https://www.googleapis.com/auth/youtube.upload']
   });
   ```

3. Upload Endpoint (`web/app/api/youtube/upload/route.ts`):
   ```typescript
   const youtube = google.youtube('v3');
   
   await youtube.videos.insert({
     part: ['snippet', 'status'],
     requestBody: {
       snippet: {
         title: spec.youtube.title,
         description: spec.youtube.description,
         tags: spec.youtube.tags,
         categoryId: spec.youtube.category_id
       },
       status: {
         privacyStatus: 'private' // or 'unlisted'
       }
     },
     media: {
       body: fs.createReadStream(videoPath)
     }
   });
   ```

4. Integration:
   - Add "Upload to YouTube" button to completed renders in `/history`
   - Store YouTube video ID in database (Supabase?) for tracking
   - Webhook for video processing completion

**Acceptance Criteria:**
- [ ] User can authorize YouTube access via OAuth
- [ ] Completed videos upload successfully
- [ ] Title, description, tags auto-populated from spec
- [ ] Captions (.srt) uploaded as subtitles

---

### 12. Multi-Language Support
**Status:** 🔴 Not started  
**Priority:** P3 (Low)  
**Effort:** 8-10 hours

**Current State:**
- All content English-only
- Edge TTS supports 75+ languages
- LLM can generate multilingual scripts

**Required Work:**

1. **Language Selector** (form field):
   ```tsx
   <select name="language">
     <option value="en-GB">English (British)</option>
     <option value="es-ES">Spanish (Spain)</option>
     <option value="fr-FR">French</option>
     <option value="pt-BR">Portuguese (Brazil)</option>
     <option value="ar-SA">Arabic (Saudi Arabia)</option>
   </select>
   ```

2. **LLM Prompt**:
   ```typescript
   const systemPrompt = `...
   LANGUAGE: Generate all voiceover scripts in ${language}.
   Use native football terminology (e.g., "fútbol" in Spanish, not "football").
   ...`;
   ```

3. **TTS Voice Mapping**:
   ```python
   # src/pipeline/voiceover.py
   VOICE_MAP = {
       "en-GB": "en-GB-RyanNeural",
       "es-ES": "es-ES-AlvaroNeural",
       "fr-FR": "fr-FR-HenriNeural",
       "pt-BR": "pt-BR-AntonioNeural",
       "ar-SA": "ar-SA-HamedNeural"
   }
   ```

4. **RTL Layout Support** (Arabic/Hebrew):
   ```css
   [lang="ar"] .scene-content {
     direction: rtl;
     text-align: right;
   }
   ```

**Acceptance Criteria:**
- [ ] User can select target language
- [ ] LLM generates native-quality voiceover scripts
- [ ] TTS uses appropriate voice
- [ ] Text overlays render correctly (incl. RTL)

---

### 13. Thumbnail Generation
**Status:** 🟡 Module exists (`src/pipeline/thumbnail.py`)  
**Priority:** P3 (Low)  
**Effort:** 2 hours (integration only)

**Current State:**
- `thumbnail.py` complete with Pollinations Flux integration
- Not wired to pipeline
- YouTube uploads have no custom thumbnail

**Required Work:**

1. **Generate Thumbnail** (`src/pipeline/compose.py:576`):
   ```python
   from pipeline.thumbnail import build_thumbnail_prompt, thumbnail_image_url
   from pipeline.fetchers import download_file
   
   # After final video render:
   thumb_prompt = build_thumbnail_prompt(
       spec, 
       brand_guardrails={"accent": "#FFD700", "background": "#0a0a0a"},
       style="bold",
       main_text=spec["scenes"][0]["headline"]  # Hook headline
   )
   thumb_url = thumbnail_image_url(thumb_prompt, seed=42)
   thumb_path = out / f"{spec['id']}_thumbnail.png"
   download_file(thumb_url, thumb_path, label="thumbnail")
   ```

2. **Upload with Video**:
   - YouTube API: `thumbnails.set()` endpoint
   - Requires additional OAuth scope: `youtube.upload`

**Acceptance Criteria:**
- [ ] Thumbnail generated after video completion
- [ ] Saved as `<id>_thumbnail.png` in build artifacts
- [ ] Uploaded to YouTube with video (if YouTube integration enabled)

---

### 14. Analytics Dashboard
**Status:** 🔴 Not started  
**Priority:** P3 (Low)  
**Effort:** 10+ hours

**Future Feature:**
- Track: renders triggered, completion rate, error rate, avg render time
- YouTube metrics: views, watch time, engagement (via YouTube Analytics API)
- Cost tracking: OpenRouter API spend, GitHub Actions minutes
- Display in `/analytics` page with charts (Recharts/Victory)

---

## 📊 Priority Matrix

| Item | Priority | Effort | Impact | Status |
|------|----------|--------|--------|--------|
| Dashboard Integration | P0 | 2-3h | High | 🔴 |
| Error Monitoring | P0 | 1h | High | 🟡 |
| Evidence Grounding | P1 | 4-5h | High | 🟡 |
| Stock Footage Quality | P1 | 3-4h | Medium | 🔴 |
| Aspect Preview | P2 | 2h | Low | 🟡 |
| Voiceover Pacing | P2 | 3h | Medium | 🟡 |
| Parallel Rendering | P2 | 2h | Medium | 🟡 |
| E2E Tests | P2 | 4-5h | Medium | 🔴 |
| YouTube Upload | P3 | 6-8h | Medium | 🔴 |
| Multi-Language | P3 | 8-10h | Low | 🔴 |
| Thumbnail Gen | P3 | 2h | Low | 🟡 |

**Legend:**
- 🔴 Not started
- 🟡 In progress / Partially complete
- 🟢 Complete

---

## 🎯 Recommended Next Sprint

**Goal:** Make pipeline production-ready for daily use

**Week 1 (16 hours):**
1. Dashboard Integration (3h) — P0
2. Error Monitoring (1h) — P0
3. Evidence Grounding (5h) — P1
4. Stock Footage Quality (3h) — P1
5. Parallel Rendering (2h) — P2
6. Buffer (2h)

**Deliverables:**
- Real-time render status in web UI
- Sentry alerts for LLM failures
- Cited sources in voiceover scripts
- 80%+ relevant stock footage
- <3 minute render times

**Success Metrics:**
- 0 manual interventions for 10 consecutive video renders
- <5% error rate on LLM generation
- User satisfaction: 8/10 or higher on stock footage relevance

---

## 📝 Documentation Backlog

- [ ] README.md: Add LLM setup instructions
- [ ] CONTRIBUTING.md: Developer setup guide
- [ ] API.md: Document all `/api/*` endpoints
- [ ] BRIEF_FORMAT.md: Markdown brief schema reference
- [ ] TROUBLESHOOTING.md: Common errors and fixes
- [ ] .env.example: All required environment variables

---

**Last Updated:** 2026-09-07 14:18 UTC  
**Next Review:** 2026-09-14 (1 week)


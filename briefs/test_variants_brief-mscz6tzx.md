# Test Brief — Variant Coverage Check

## Hook

**Kind:** hook
**Duration:** 6s
**Variant:** bold-impact
**Eyebrow:** Head-to-Head
**Headline:** Haaland vs Mbappe
**Subhead:** The Ultimate Statistical Clash
**Pill:** Stats Deep Dive

> "Who truly dominates modern football? Let's check the numbers."

## Scene 1 — Hook Glitch Reveal

**Kind:** hook
**Duration:** 6s
**Variant:** glitch-reveal
**Eyebrow:** Unsettled Opening
**Headline:** Something Isn't Adding Up
**Subhead:** The numbers don't lie — but they do surprise

> "Brace yourself. This one flips the script."

## Scene 2 — Hook Split Focus

**Kind:** hook
**Duration:** 6s
**Variant:** split-focus
**Eyebrow:** Sidebar Layout Check
**Headline:** One Big Headline, One Narrow Sidebar
**Subhead:** Asymmetric framing for the opening beat

> "Big headline left, context right — let's see it render."

## Scene 3 — Hook Fallback Variant

**Kind:** hook
**Duration:** 6s
**Variant:** totally_unrecognised_hook_variant
**Eyebrow:** Fallback Check
**Headline:** Unknown Variant Should Not Crash
**Subhead:** This should quietly fall back to bold-impact

> "Unknown hook variants should degrade gracefully."

## Scene 4 — Scale Comparison

**Kind:** scale
**Duration:** 8s
**Eyebrow:** By The Numbers
**Headline:** Goals This Season
**Sub:** Across all competitions

**Stats:**
- 52 | GOALS
- 45 | GAMES
- 0.95 | G/90

> "Fifty-two goals in a single season — let that sink in."

## Scene 5 — Portrait Lineup

**Kind:** portrait
**Duration:** 8s
**Eyebrow:** The Contenders
**Headline:** Two Strikers, One Throne
**Sub:** Born a generation apart

**Names:**
- HAALAND | BORN 2000
- MBAPPE | BORN 1998

> "Two different paths to the same summit."

## Scene 6 — Record Counter

**Kind:** record
**Duration:** 7s
**Eyebrow:** Career Milestone
**Counter label:** Career Goals
**Counter num:** 300
**Counter suffix:** +
**Name:** Erling Haaland
**Quote:** "I just want to score goals."

> "Three hundred goals and counting — a milestone most never reach."

## Scene 7 — Grid Cards

**Kind:** grid
**Duration:** 9s
**Eyebrow:** Squad Snapshot
**Headline:** The Full Picture

**Cards:** (kind=grid — flag | name | stat1 | stat2 | "quote")
- 🇳🇴 | HAALAND | 52 goals | 45 games | "I don't celebrate."
- 🇫🇷 | MBAPPE | 41 goals | 40 games | "Speed is a weapon."

> "Put them side by side and the picture gets clearer."

## Scene 8 — Quote Spotlight

**Kind:** quote
**Duration:** 6s
**Eyebrow:** In Their Own Words
**Quote:** "I don't celebrate until the trophy is in my hands."
**Attribution:** — Erling Haaland
**Sub:** On staying focused mid-season

> "Confidence, in his own words."

## Scene 9 — List Breakdown

**Kind:** list
**Duration:** 8s
**Eyebrow:** Key Takeaways
**Headline:** What Separates Them
**Sub:** Three factors that matter most

**Items:**
- Finishing efficiency in the box
- Off-ball movement and spacing
- Big-game performance under pressure

> "Three factors, one clear separation."

## Scene 10 — Split Side by Side

**Kind:** split
**Duration:** 8s
**Variant:** side-by-side
**Eyebrow:** Head to Head
**Headline:** Erling Haaland vs Kylian Mbappe
**Body:** Two different styles, two elite outputs — placed side by side.
**Image query:** haaland mbappe split screen football
**Left:** Haaland | 52 Goals | Man City
**Right:** Mbappe | 41 Goals | PSG

> "Haaland crushed the Premier League, while Mbappe ruled Ligue 1."

## Scene 11 — Split Top Bottom

**Kind:** split
**Duration:** 8s
**Variant:** top-bottom
**Eyebrow:** Stacked Layout Check
**Headline:** Same Data, Vertical Frame
**Body:** Stacked for 9:16 — text on top, still-image note below.
**Image query:** football stats vertical layout
**Top label:** Haaland
**Bottom label:** Mbappe

> "Same comparison, stacked to fit the vertical frame."

## Scene 12 — Split Diagonal Versus

**Kind:** split
**Duration:** 8s
**Variant:** diagonal-versus
**Eyebrow:** Efficiency Check
**Headline:** Haaland <accent>vs</accent> Mbappe
**Body:** Pure per-90 efficiency, no context, just output.
**Image query:** haaland mbappe diagonal versus graphic
**Left:** Haaland | 0.95 G/90
**Right:** Mbappe | 0.88 G/90

> "On pure efficiency, Haaland edges ahead."

## Scene 13 — Split Fallback Check

**Kind:** split
**Duration:** 8s
**Variant:** non_existent_variant_test
**Eyebrow:** Fallback Layout Check
**Headline:** Unknown Variant Fallback
**Body:** This should silently fall back to the default side-by-side layout.
**Image query:** haaland mbappe fallback test
**Left:** Haaland
**Right:** Mbappe

> "Unknown variants should safely fall back to default without crashing."

## YouTube Metadata

**Title options:**
1. Haaland vs Mbappe: The Stats Don't Lie
2. Who is Better? Haaland or Mbappe?

**Description:** End-to-end variant test brief for pipeline validation. Covers all 8 scene kinds and every documented hook/split variant, plus unrecognised-variant fallback behavior.

**Tags:** football, stats, haaland, mbappe, pipeline test

**Category:** Sports

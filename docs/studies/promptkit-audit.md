---
title: "Prompt-kit component audit — 2026-08-04"
type: study
status: done
date: 2026-08-04
tags: [openagent, prompt-kit, ui, study]
---

# Prompt-kit component audit — 2026-08-04

Source of truth: `ibelick/prompt-kit` clone at commit `de80375` (repo HEAD,
fetched fresh). Method: read official `components/prompt-kit/*.tsx`, read our
`src/ui/components/*.tsx`, compare semantics — not raw diffs (our files are
deliberate Obsidian adaptations: no tailwind, `oa-` classes, obsidian shims).

Our 18 vendored components vs official 21 (+image, +response-stream, +mcp,
+jsx-preview = upstream additions we never vendored — not debt, just unclaimed
new surface).

## A. Verified CORRECT (usage + port faithful or deliberately divergent, documented)

| Component | Verdict |
|---|---|
| feedback.tsx (FeedbackBar) | faithful presentational surface, owner-verified shape 2026-08-02 ✓ |
| tool.tsx | faithful AI-SDK-v5 card + documented extensions (denied, auto-open on error, 5000-char display cap, steer split) ✓ |
| system-message.tsx | faithful w/ documented trims (no fill, default icons only) ✓ |
| code-block.tsx | deliberate Shiki → mini regex tokenizer (multi-MB grammar bundle avoided); compound shape kept ✓ |
| markdown.tsx | deliberate Obsidian `MarkdownRenderer` rebase (wikilinks/mermaid/preprocess); streaming renders plain pre-wrap until finish — sidesteps upstream's per-token memo-block problem entirely ✓ |
| message.tsx | faithful; avatars retired per Hermes parity (v0.1.39, documented) ✓ |
| reasoning.tsx | **better than upstream in 2 spots**: userTouched latch outranks auto-close (upstream can clobber a manual re-open at stream end); ResizeObserver live-pin while streaming ✓ |
| source.tsx | single-piece API, CSS-only hover card (no floating-ui dep) ✓ |
| loader.tsx | full 12-variant set; default documented as `typing` (upstream `circular`) ✓ |
| thinking-bar.tsx | trimmed surface (no onClick) — type-safe by construction ✓ |
| file-upload.tsx | `accept` grammar faithful (.ext / image/* / exact mime); window→root listener scoping is the CORRECT Obsidian adaptation; counter-based dragenter/leave ✓ |
| prompt-input.tsx (controlled model) | echo-guard (lastEmittedRef) + inert hydration solid ✓ (see B2/B3/B6) |
| text-shimmer.tsx | API + clamp identical ✓ (see B5) |

## B. Findings worth fixing

1. **[MED-HIGH] chat-container misses ResizeObserver.** — ✅ **FIXED v0.1.72**
   Official `use-stick-to-bottom` watches resize; ours only watches DOM
   mutations. Async content that reflows WITHOUT mutating — vault images
   (`![[img.png]]` resolved to resource paths load late) — pushes content
   down while "pinned": the view quietly sits mid-air until some other
   mutation/scroll happens. Fix: ResizeObserver on the scroll box (the
   reasoning `LiveBody` idiom already exists in-tree). Add `role="log"`
   while there (official has it).

2. **[MED-HIGH] prompt-input has no IME composition guard.** — ✅ **FIXED v0.1.72**
   `onInput` fires during CJK composition; `syncChips` can rewrite the
   editor DOM mid-composition (a committed chip earlier in the text while a
   composition session is active) and that destroys the IME session.
   Upstream patched the analogous textarea bug in #82 (Chinese IME scroll
   jump). Fix: skip `syncChips` when `e.nativeEvent.isComposing`, re-sync
   on `compositionend`.

3. **[LOW-MED] PromptInput root is not click-to-focus.** — ✅ **FIXED v0.1.73**
   Official: clicking anywhere on the composer padding focuses the editor.
   Ours: dead clicks on the frame. Fix: focus editor on container click
   when the target isn't inside a `button`.

4. **[LOW] ScrollButton pops (mount/unmount).** — ✅ **FIXED v0.1.73**
   Official keeps it mounted and fades/slides with `pointer-events-none`
   gating. Cosmetic polish.

5. **[LOW] text-shimmer band is half the official width.** — ✅ **FIXED v0.1.73**
   Ours stops at `50% ± spread/2` (band = spread); official `50% ± spread`
   (band = 2×spread → default 20 gives 30%–70%). One-line CSS fix
   (drop the `/2`) to match official exactly.

6. **[LOW] ComposerHandle.setSelectionRange ignores `end`.** — ✅ **FIXED v0.1.73**
   Interface promises a range, implementation collapses to caret. All
   current callers pass (n,n) so nothing breaks today. Honest-API fix:
   rename to `setCaret(pos)` or implement a true range.

## C. Dead surface confirmed (imported by nobody, repo-wide grep) — ✅ **PURGED v0.1.74**

- `chain-of-thought.tsx` (105 lines) — already flagged in the CSS arc.
- `steps.tsx` (103 lines) — zero importers.
- `prompt-suggestion.tsx` (27 lines) — zero importers.
- `MessageContent` export inside `message.tsx` — ChatApp uses
  `MarkdownDoc` directly.
Purge cautions: CSS `.oa-steps-*` / `.oa-prompt-suggestion` / `.oa-cot-*`
rules and the smoke negative guard for `.oa-cot-trigger` must move
together; Loader survives (tool.tsx imports it).

## D. Upstream deltas that are n/a

- source #89 (text-leading + tabular-nums on numeric labels) — we render
  domain text only, never numeric labels.
- tool `tw-animate-css` — cosmetic animation classes, our transitions are
  already equivalent.
- prompt-input #92 — textarea autosize reshuffle; our composer is
  contenteditable, no equivalent path.

## E. Upstream additions never vendored — ✅ VERDICT 2026-08-04 (owner-approved: SKIP ALL)

Re-cloned upstream at `de80375` and reviewed the three components we
never vendored, with grounded fit-checks against our `src/`:

- **`image.tsx` (76 lines)** — renders base64/uint8Array images RETURNED
  by a provider (image-generation output). Fact-check: every `base64` in
  our `src/` is OUTBOUND (we encode vault attachments → providers as
  vision input, `ChatApp.tsx:444`); no flow ever receives generated
  images. Porting = zero call sites → the same dead surface purged in C.
- **`jsx-preview.tsx` (81 lines)** — live JSX playground renderer; pulls
  `react-jsx-parser` in as a new bundled dependency for a feature with
  zero use cases in a vault-agent plugin.
- **`response-stream.tsx` (394 lines)** — typewriter/fade reveal over
  RAW text. Conflicts with our progressive markdown streaming (raw
  `**`/``` tokens would visibly "type out"); its fade mode re-segments
  the ENTIRE text with `Intl.Segmenter` on every incoming chunk (O(n²)
  DOM churn on long agent answers — upstream's own design); the gain is
  cosmetic-only on top of provider-paced streaming and it risks the
  auto-scroll pin fixed in B1. A subset port (plain-phase smoothing,
  throttled, opt-in) was offered to the owner and declined.

Decision recorded via owner menu pick "skip semua (rekomendasi)".
Re-opening any of the three requires a concrete new call site first.

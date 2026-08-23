---
title: "Empty-state parity — Hermes Desktop Intro (v0.1.35, 2026-08-01)"
type: study
status: done
date: 2026-08-01
tags: [openagent, hermes, parity, study]
---

# Empty-state parity — Hermes Desktop Intro (v0.1.35, 2026-08-01)

Study (raw, @main): `apps/desktop/src/components/chat/intro.tsx` + usage in
`app/chat/index.tsx` (showIntro: primary fresh draft, no session, no
messages) + `components/assistant-ui/thread/index.tsx` (emptyPlaceholder)
+ `components/chat/intro-copy.jsonl` (75 personality copies).

## Official structure
- Big uppercase wordmark ("HERMES AGENT"), tracked 0.08em, muted.
- Exactly ONE body copy line (the `headline` in the data is NOT rendered).
- Rotation: `(mountSeed + introSeed) % copies.length` — a new copy per
  fresh draft; neutral personalities ('', default, none, neutral) use a
  fixed pool; other personalities get generated "<Label> mode …" templates.

## Shipped (super-minimal, owner pick)
- `src/ui/components/intro.tsx` — faithful port: WORDMARK **OPEN AGENT**,
  neutral pool (5) + fallback pool (5) + per-personality templates (5),
  all vault-adapted (notes, not repos). Seed = hash(sessionId), so each
  fresh chat rotates deterministically.
- Retired (owner confirmed super-minimal): sparkles icon, "How can I
  help?" title, provider·model sub-line, the "No provider configured"
  warning chip, and the slash/@ hint footer. Misconfigured providers
  surface via the composer pill ("Select model") and settings.

Guards: smoke block v0.1.35 (component, wiring, retirements), `[empty]`
check in the real-preview harness (wordmark + copy line + no hint left).

---

## v0.1.36 — copy fidelity (owner report: "berbeda dari punya kita")

The v0.1.35 port had two real drifts vs the official mechanism:
1. Selection rule: the official reads `INTRO_COPY_BY_PERSONALITY[key]`
   FIRST and only falls back to generated templates when the personality
   has no pool — ours jumped straight to templates for every non-neutral
   personality, so 10 overlapping personalities (helpful, concise,
   technical, creative, teacher, kawaii, catgirl, pirate, shakespeare,
   surfer) showed invented lines instead of the official ones.
2. Rotation: the official uses a random mount seed plus a per-draft seed;
   ours hashed the session id only (no mount variety).

Fix: `intro-copy.jsonl` embedded VERBATIM (75 records, 15 personalities ×
5 — check: bodys never mention "Hermes"), `parseIntroCopy` tolerant
line-by-line port, `neutralCopy()` chain, verbatim templates, mountSeed
`useState(random)` + draft seed. Our vault-adapted pool is retired.

Guards: smoke v0.1.36 (75 records, jsonl-pool-first rule, mount seed,
verbatim spot records like noir/hype), `[empty]` harness now asserts the
rendered line is a member of the official body pool (`introBodyPool()`).

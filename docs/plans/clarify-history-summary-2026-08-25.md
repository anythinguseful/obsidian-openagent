---
title: "Clarify history summary"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, chat, clarify, sessions]
---

# Clarify history summary

## Summary

Clarify questions live only in React state, so switching/loading history clears
the live card and leaves no persisted question or answer in the transcript.
This plan persists a clarify turn part and renders a read-only summary in history.
The owner chose read-only history: an old agent loop is never resumed silently.

## Contract

- Pending, answered, skipped, and interrupted clarify requests persist with the
  assistant turn.
- The live card remains the only interactive surface for an active run.
- History renders question, offered choices, answer/status, and never resumes a
  stale loop.
- Switching away marks an active question interrupted before the run is stopped.

## Implementation status (2026-08-25)

- `TurnPart` now persists clarify question, choices, mode, status, and answer.
- Live cards remain interactive above the composer; the same part renders as a
  quiet read-only summary once answered, skipped, interrupted, or loaded from
  history.
- Stopping/switching a run marks its outstanding question interrupted before
  resolving the paused promise. It never resumes a stale loop from history.
- The real-DOM clarify lane proves all four interaction modes plus four
  persisted summaries, including answered and skipped states.

## Verification

`npm run verify`, the browser PDF lane, and `OA_ONLY=clfy` all pass under
HeadlessChrome 149.

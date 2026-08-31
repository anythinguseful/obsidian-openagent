# Arena adapter — ADHD

Upstream: `agents/skills/vendor/uditakhourii/adhd/SKILL.md`.

Use this adapter whenever the ADHD skill is loaded in Arena. It does not
replace the skill body; it only names what this environment cannot do.

## Parallel isolation

The skill requires **five isolated generator calls that do not see each other**.
Arena Agent Mode has no Claude-Code `Task`/`Agent` fan-out.

Do **not** fake isolation by writing five idea lists in one pass (that is the
anti-pattern the skill names: a wider single thought).

Arena substitute, in order:

1. If the host actually offers parallel isolated subagents, use them.
2. Otherwise run five **separate** generation turns (or tool-isolated prompts)
   that receive **only** the problem P, user context, and one frame. Do not
   paste earlier branches into later ones.
3. Only after all five return, score / cluster / deepen in the parent context.

If even sequential isolation is impossible (one context, one model, no
subagents), **say so**, then either abort to a direct answer or ask the owner
whether a single-context “wider list” is acceptable. Do not claim you ran ADHD.

## Cost and skip rules

Keep the skill’s pre-flight gate. Do not run ADHD on syntax, known-root-cause
bugs, or closed phrasing. `/adhd` still skips the gate.

Do not install the `adhd-agent` npm CLI into this repository. The skill text
is the loop; the CLI is optional upstream tooling.

## Product constraints still win

ADHD explores options. It does not authorize violating `openagent-ui`,
Workspace policy, or the working agreement. A wild frame that implies a
Settings reskin or a custom palette is a **candidate**, not a ship.

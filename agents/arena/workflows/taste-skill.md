# Arena adapter — taste-skill (`design-taste-frontend`)

Upstream: `agents/skills/vendor/leonxlnx/taste-skill/SKILL.md`.

## When it applies

The upstream skill is for **landing pages, portfolios, and marketing
redesigns**. It says so in its own out-of-scope list: dashboards, dense product
UI, admin panels, and native-host chrome are not its job.

Open Agent’s plugin surfaces (chat, Settings, Quick Ask, modals, status) are
**product UI inside Obsidian**. For those, load `openagent-ui` first. Taste
may inform anti-slop critique (no purple mesh, no three equal cards) only
where it does not fight the binding contract.

## Precedence (binding)

1. Owner decisions in `docs/working-agreement.md`.
2. `agents/skills/internal/openagent-ui/SKILL.md`.
3. `functional-ui`, then this vendor skill.

On conflict, **openagent-ui wins**. Concretely that means:

- Colors and type stay Obsidian `var(--*)`. Do not install Geist/Inter stacks
  or Tailwind palettes into `styles.css`.
- No glassmorphism, heavy gradient, or custom font on plugin chrome.
- Settings are not reskinned. Addition, not a landing-page overhaul.
- Production UI uses Lucide via `setIcon`, not Phosphor/HugeIcons.
- Interface copy stays English sentence case.

## What “setup” means here

Vendoring the snapshot is enough for agents to **read** it. There is no npm
install, no Tailwind, and no block-library folder. Do not copy upstream
`examples/`, `research/`, or `assets/` into this repo.

If the owner later asks for a standalone marketing page (not the plugin),
then this skill may lead — still honor accessibility and reduced-motion
rules from `web-design-guidelines`.

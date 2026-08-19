# Changelog

## v0.1.0 — 2026-08-19

First public release.

### The skill

- **Tiered dispatch core** — planning and synthesis stay in the main session (the
  model you chose); each sub-agent gets the cheapest capable tier (top/mid/low) via a
  four-axis rubric (reasoning depth, spec ambiguity, blast radius, context
  integration). Tie-breaker: *"if this comes back wrong, will I notice?"*
- **Budget modes** — economy / balanced / quality shift tier boundaries; explicit
  token budgets re-plan the dispatch. Per-session override via
  `HYBRID_DISPATCH_BUDGET` (spoken instruction › env var › config file).
- **Escalation, not looping** — one retry at the next tier up, carrying the failed
  attempt; two escalations means the decomposition was wrong.
- **Task-type playbooks** — stage-by-stage tier presets for research, development,
  documentation, and audit work, encoding where verification is cheap per type.
- **Visible by design** — activation banner, per-subtask assignment list, live
  spawn/return lines, closing dispatch log with per-tier token tally.
- **Honest accounting** — one JSON line per run in `.dispatch-log.jsonl`
  (append-only, concurrent-session safe). Records `model_actual` when the platform
  exposes the served model — substitutions are surfaced, never papered over; missing
  numbers stay `null`, never fabricated.
- **Tier-collapse detection** — warns when a model switch makes tiers identical
  (`collapse_ack` accepts a deliberate merge); inversion always warns.

### Cross-platform

- Installs natively on **Claude Code, Codex, Gemini CLI, opencode** (plus Antigravity
  via the shared `~/.agents/skills` convention): skill folder + deterministic gate
  block per platform's own instruction mechanism.
- Tier models always come from the host platform's own catalog — tier *roles* are
  portable, model identifiers are not.
- `install.sh`: one-line curl install for macOS/Linux, idempotent, `--only`,
  `--dry-run`, `--uninstall`.

### Companion CLI (optional, zero runtime deps, Node 18+)

- `install` / `init` / `doctor` / `stats` / `log` / `session-check`.
- `doctor`: install state, gate blocks, config validity, tier sanity, compaction
  thresholds. `session-check`: SessionStart hook that speaks only when something is
  wrong. Not yet on npm — build from `cli/` via `npm link`.
- The judgment half (rubric, decomposition, verification strategy) deliberately has
  no CLI equivalent: the skill needs nothing installed.

### Evaluated

- 3 eval tasks × with/without skill, adversarially graded: all runs followed the
  protocol; economy mode produced the intended cheap-generation +
  top-tier-verification shape. Known limitation: baselines were contaminated by the
  project skill registry (fix queued for iteration 2). Trigger-word optimization:
  zero false positives across 5 rewrite iterations; deterministic gate files carry
  activation instead of description matching.

# hybrid-dispatcher

A cross-platform agent skill for **tiered model dispatch** in multi-agent work: the
main session (the model *you* chose — e.g. Fable 5) keeps all planning, judgment, and
synthesis, while every sub-agent runs at the cheapest model tier that can do its job
well — top / mid / low (on Claude Code: fable / opus / sonnet).

```
⚡ hybrid-dispatcher · platform=claude-code · budget=balanced · 6 subtasks planned
```

## Why

Delegation failures are rarely "the sub-agent's model was too weak" — they're "the
orchestrator delegated judgment it should have kept." So the skill enforces a division
of labor (planning and synthesis never leave the main session), then spends model
budget where it pays: **cheap generation + strong verification** beats expensive
generation with no check. When torn between tiers, the tie-breaker is one question:
*"if this comes back wrong, will I notice?"*

## What it does

- **Four-axis difficulty rubric** (reasoning depth, spec ambiguity, blast radius,
  context integration) maps each subtask to a tier
- **Budget modes** — economy / balanced / quality — shift the tier boundaries; a
  spoken "do this cheaply" or an explicit token budget re-plans the dispatch
- **Escalation, not looping** — a failed result re-runs once at the next tier up,
  carrying the failed attempt; never retries the same tier twice
- **Task-type playbooks** — stage-by-stage tier presets for research, development,
  documentation, and audit work ([references/task-playbooks.md](.claude/skills/hybrid-dispatcher/references/task-playbooks.md))
- **Visible by design** — an activation banner, a per-subtask assignment list, and a
  closing dispatch log are mandatory output
- **Per-project config** — `.agent-dispatch.json`, created on first use after
  confirming the tier→model mapping with you; tier *roles* carry across platforms,
  model identifiers are always the host platform's own

## Install

One line — detects the agent systems on your machine, copies the skill, and
writes the gate blocks (idempotent; re-run to update):

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/hybrid-dispatcher/main/install.sh | bash
```

Or from a checkout:

```bash
git clone https://github.com/wikieden/hybrid-dispatcher && cd hybrid-dispatcher && ./install.sh
```

```
./install.sh                 # install/update everywhere it finds an agent system
./install.sh --only codex    # one platform: claude | codex | gemini | opencode
./install.sh --dry-run       # preview, change nothing
./install.sh --uninstall     # remove skill copies and gate blocks
```

### Manual install

The skill is plain markdown — one folder, no dependencies:

| Platform | Skill folder | Gate (deterministic trigger) |
|---|---|---|
| Claude Code | `~/.claude/skills/hybrid-dispatcher/` (or project `.claude/skills/`) | project `CLAUDE.md` |
| Codex | `~/.codex/skills/hybrid-dispatcher/` | `~/.codex/AGENTS.md` or repo `AGENTS.md` |
| Gemini | `~/.gemini/skills/hybrid-dispatcher/` | `~/.gemini/GEMINI.md` |
| opencode | `~/.config/opencode/skills/hybrid-dispatcher/` | `~/.config/opencode/AGENTS.md` |
| anything else | any readable path | that system's standing-instruction file — see [references/generic-cli.md](.claude/skills/hybrid-dispatcher/references/generic-cli.md) |

Copy [`.claude/skills/hybrid-dispatcher/`](.claude/skills/hybrid-dispatcher/) to the
skill folder, then add a short gate block to the platform's instruction file telling
the agent to read `SKILL.md` before spawning any sub-agent. (Description-based skill
triggering alone is unreliable for a gating skill — measured near-zero autonomous
trigger rates in non-interactive runs — so the deterministic gate matters.)

On non-Claude platforms, tier models must come from that platform's own catalog
(Codex: whatever `codex exec --help` lists; etc.) — never another vendor's model names.

## Step 1 — Initialize: set your dispatch strategy

After installing, the first thing to do in each project is set the strategy. Either
trigger it deliberately — say **"初始化 dispatch 配置"** / "initialize the dispatch
config" (or `/hybrid-dispatcher`) — or just start your first multi-agent task and
init runs before anything is spawned. Either way it's a one-time, three-decision
conversation:

```
You:   初始化 dispatch 配置

Agent: ⚡ hybrid-dispatcher · platform=claude-code · initializing
       No .agent-dispatch.json found. Proposed strategy for this project:
         top: (omit model — inherits your session model)
         mid: opus      low: sonnet      budget_mode: balanced
       Confirm, or tell me what to change.

You:   预算档改 economy，其他可以

Agent: → wrote .agent-dispatch.json — this question never comes back for this project.
```

**Decision 1 — tier→model mapping.** The defaults fit most Claude Code setups:
`top = inherit` (whatever model *you* picked for the session — that's the point),
`mid = opus`, `low = sonnet`. Change it when your situation differs — e.g. running
the session on Opus already? then `top = inherit, mid = sonnet, low = haiku`. On
Codex/Gemini/opencode the proposal lists *that* platform's models instead (Codex:
one model family, xhigh/medium/low reasoning effort as the tier lever).

**Decision 2 — default budget mode.** Pick per project temperament:
- `economy` — exploratory repos, prototypes, anything where output is easy to verify
- `balanced` — the default; the rubric as written
- `quality` — production-critical code, security-sensitive work, expensive-to-detect failures

**Decision 3 — where top-tier is allowed.** By default sub-agents may run at top tier
for design/verification tasks. If you want top tier reserved for the main session only
(all sub-agents capped at mid), say so at init — it's recorded in the config.

**Decision 4 — auto-compaction threshold.** Multi-agent work fills context fast, and a
forced mid-task compaction loses working state at the worst moment. Init checks the host
platform's setting and, if it's at the (late) default, proposes an earlier trigger:
**50–60% of the window for 1M+ long-context models, ~75% for ~200K windows** — e.g.
Claude Code `autoCompactWindow: 550000`, Codex `model_auto_compact_token_limit`, Gemini
`chatCompression.contextPercentageThreshold: 0.55`. The value is written to the
platform's own config file (that file stays the single source of truth), so you can
change it later without touching the skill.

The result is `.agent-dispatch.json` at the project root — gitignore it, each
user/platform confirms their own:

```jsonc
{
  "platform": "claude-code",
  "tiers": {
    "top": "inherit",        // omit/inherit = whatever model YOU picked for the session
    "mid": "opus",
    "low": "sonnet"          // haiku exists one tier below for trivial bulk sweeps
  },
  "budget_mode": "balanced", // economy | balanced | quality
  "confirmed": "2026-08-16"
}
```

On non-Claude platforms tiers hold that platform's own identifiers — e.g. Codex records
literal flags like `{"model": "...", "config": "model_reasoning_effort=\"xhigh\""}`.
Opening the same project on a second platform keeps the tier *roles* and only remaps
the identifiers (the skill offers to add a second platform block). Edit the file
directly anytime to change defaults; per-task spoken overrides always win.

## Step 2 — Use it

You don't call the skill directly — describe a task that needs multiple sub-agents
and the gate makes the skill take over (manual: `/hybrid-dispatcher` or "use
hybrid-dispatcher").

### What every dispatch looks like

Three things are always visible:

1. **Activation banner** — `⚡ hybrid-dispatcher · platform=claude-code · model=fable · budget=balanced · 6 subtasks planned`

   Before the banner, the skill checks your *current* session model against the configured
   tiers. Switch models mid-project (`/model opus` when `mid` is also opus) and the tiers
   collapse into each other — delegation stops buying anything. You get a one-line warning
   with a shifted mapping to accept or ignore; it never blocks the work:
   ```
   ⚠ session model is opus — same as tier mid, so top/mid are identical.
     Suggest: mid=sonnet, low=haiku for this session. Proceeding with current config.
   ```
2. **Assignment list before spawning** (your moment to intervene — "run S3 on opus" works):
   ```
   S1 inventory error paths        → low/sonnet   (mechanical read-and-report)
   S2 design error contract        → top/inherit  (mistakes poison everything downstream)
   S3 refactor db.py               → mid/opus     (clear spec, test-verified)
   S4 run test suite               → low/sonnet   (execute and report)
   S5 adversarial diff review      → top/inherit  (misses would look plausible)
   ```
3. **Dispatch log at the end** — every sub-agent, its task, model, and outcome.

### Steering with plain language

| You say | Effect |
|---|---|
| "do this cheaply" / "省着点" | economy: downgrade wherever output is verifiable; top tier only for verification |
| "quality first, don't skimp" | quality: critical path up a tier; multi-attempt + judge for design questions |
| "keep it under ~200k tokens" | plans the whole dispatch against the budget, downgrades non-critical work first |
| "run the parser task on opus" | overrides one assignment; the rest stand |
| *(nothing)* | balanced — the rubric as written |

## Scenarios

**Bulk migration — "convert these ~40 endpoints from callbacks to async/await, in parallel"**
Development playbook: conversion-pattern spec written at top tier first (one page, gates
everything); endpoints batched to parallel mid-tier implementers (low if the codemod is
fully mechanical and tests exist); test run on low; final adversarial diff review on top.
Typical shape: ~80% of agent-hours on cheap tiers.

**Cost-conscious audit — "audit this repo for bugs, don't run everything on the big model"**
Audit playbook, economy mode: parallel low-tier finders per module (slight overlap at file
boundaries so seams get two readers); orchestrator verifies every finding line-by-line
against source before absorbing; cross-module/systemic findings added in the main session.
In our eval this shape found all seeded bugs with zero top-tier sub-agents.

**Competitor research — "research these 6 products, write a comparison"**
Research playbook: one low-tier reader per product (same structured note schema for all);
conflicting claims reconciled at mid; comparison and recommendation synthesized in the
main session; the 2–3 facts the conclusion rests on get a top-tier spot-check.

**Documentation — "write API docs for this package"**
Documentation playbook: structure and voice agreed in the main session first; sections
drafted in parallel on mid; terminology/link sweep on low (a script where possible); a
top-tier accuracy review checks the doc *against the code* — plausible-but-wrong docs
are the failure mode nothing else catches.

**Grunt sweep — "summarize every file, list the TODOs, cheap as possible"**
Economy short-circuit: one haiku/low agent does the whole sweep, the main session
verifies with a grep and adds what it missed. No fan-out — parallelism isn't worth the
overhead below a certain size, and the skill says so instead of spawning for show.

**Same repo, different tool — opening a Claude-initialized project in Codex**
The gate block in `~/.codex/AGENTS.md` fires; the skill finds `.agent-dispatch.json`,
sees no Codex block, and proposes one (OpenAI models, effort levels as the tier lever)
without touching the Claude mapping. Tier roles, budget mode, and escalation policy
carry over unchanged.

## Repository layout

- [`.claude/skills/hybrid-dispatcher/`](.claude/skills/hybrid-dispatcher/) — the skill:
  `SKILL.md` plus per-platform references (claude-code / codex / generic-cli) and
  task-type playbooks
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — this repo's own gate blocks
  (they double as working examples)
- `dispatch-workspace/` — eval fixtures, benchmark results, and trigger-optimization
  reports from skill-creator iterations (regenerable; not part of the skill)

## Evals

Iteration 1 (3 tasks × with/without skill, adversarially graded): all runs followed
the protocol — planning stayed in the main session, mechanical work went to
sonnet/haiku, design and verification stayed at top tier, every sub-agent finding was
verified before absorption, and economy mode produced the intended
cheap-generation + top-tier-verification shape. Known iteration-2 work: clean-room
baselines (the skill leaked into baseline runs via the project skill registry) and one
over-rigid assertion. Details in `dispatch-workspace/`.

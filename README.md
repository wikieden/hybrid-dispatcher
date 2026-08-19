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

The skill is plain markdown — no runtime, no dependencies. Installing means putting the
folder where your agent looks for skills and adding a short gate block so it fires
before sub-agents get spawned.

**macOS / Linux** — one line, detects every agent system on the machine:

```bash
curl -fsSL https://raw.githubusercontent.com/wikieden/hybrid-dispatcher/main/install.sh | bash
```

```
./install.sh                 # install/update everywhere it finds an agent system
./install.sh --only codex    # one platform: claude | codex | gemini | opencode
./install.sh --dry-run       # preview, change nothing
./install.sh --uninstall     # remove skill copies and gate blocks
```

**Windows** — the shell installer can't run there; use the companion CLI from a
checkout (not yet published to npm — `npx hybrid-dispatcher` won't resolve, and an
unpublished name is exactly the kind squatters take, so don't run it):

```bash
git clone https://github.com/wikieden/hybrid-dispatcher && cd hybrid-dispatcher/cli
npm install && npm run build && npm link   # gives you the `hybrid-dispatcher` command
hybrid-dispatcher install
```

**By hand** — copy [`.claude/skills/hybrid-dispatcher/`](.claude/skills/hybrid-dispatcher/)
into the skill folder, then add a gate block to the instruction file:

| Platform | Skill folder | Gate (deterministic trigger) |
|---|---|---|
| Claude Code | `~/.claude/skills/hybrid-dispatcher/` (or project `.claude/skills/`) | project `CLAUDE.md` |
| Codex | `~/.codex/skills/hybrid-dispatcher/` | `~/.codex/AGENTS.md` or repo `AGENTS.md` |
| Gemini | `~/.gemini/skills/hybrid-dispatcher/` | `~/.gemini/GEMINI.md` |
| opencode | `~/.config/opencode/skills/hybrid-dispatcher/` (XDG / `%APPDATA%` on Windows) | `.../opencode/AGENTS.md` |
| anything else | any readable path | that system's standing-instruction file — see [references/generic-cli.md](.claude/skills/hybrid-dispatcher/references/generic-cli.md) |

The gate matters: description-based triggering alone measured near-zero on gating tasks
in non-interactive runs, so the explicit "read this before spawning anything" line is
what actually makes the skill fire.

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

**Decision 4 — auto-compaction.** Multi-agent work fills context fast, and a forced
mid-task compaction loses working state at the worst moment. Init surfaces your platform's
current setting and the trade it implies, rather than proposing a number — because the
trade differs by platform:

| Platform | Setting | What lowering it costs |
|---|---|---|
| Claude Code | `autoCompactWindow` (tokens) | It is also the ceiling — compacting at 550k on a 1M model means a 550k window, full stop. "Compact earlier" and "keep the full window" are not both available. |
| Codex | `model_auto_compact_token_limit` | Same absolute-token semantics; compare against `model_context_window`. |
| Gemini | `chatCompression.contextPercentageThreshold` | A true percentage — genuinely "compact earlier, same window". |
| opencode | `compaction.auto` / `prune` | No threshold exposed; only on/off plus tool-output pruning. |

Claude Code also offers per-session alternatives that leave global settings alone:
`/autocompact`, the `--autocompact <tokens>` launch flag, and
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`. `precomputeCompactionEnabled: true` is free either way —
it pre-computes the summary so compaction doesn't stall the session.

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
   Merged top/mid is a legitimate choice (judgment and implementation both at the strong
   model, cheap tier still absorbing the grunt work). Set `"collapse_ack": true` in the
   config to accept it and silence the warning for good — inversion still warns, since
   that one is never on purpose.
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

### Different strategies in different sessions

`.agent-dispatch.json` is per *project*, but strategy often wants to be per *session* —
one window exploring cheaply while another does release work. Since sessions are
processes, an environment variable is the natural scope:

```bash
HYBRID_DISPATCH_BUDGET=economy claude   # this terminal: explore cheaply
HYBRID_DISPATCH_BUDGET=quality claude   # that terminal: ship carefully
```

Precedence is **what you just said › the env var › the config file**, so a spoken
"do this cheaply" still wins for one task without disturbing the session's mode. The
banner names the mode and its source, and each run records `budget_source` in the log,
so history stays readable when two sessions ran different strategies against one project.
An unrecognized value warns and falls back to the config rather than guessing.

### Logs and token accounting

**Live, while it runs** — each spawn and each return prints a line, so work leaving the
session is never invisible:

```
→ [S3] refactor db.py · mid/opus · spawned
← [S3] done · 42.1k tok · 68s
```

**At the end of every dispatch** — the log table plus a tally broken down by tier:

```
Total: 3 agents · 83.2k tokens · 154s wall · by tier: low 12.4k / mid 42.1k / top 28.7k
```

**Across the whole project** — every run is appended as one JSON line to
`.dispatch-log.jsonl` (gitignored). Ask "这个项目花了多少 token" and you get:

The skill totals it up directly for you. Once history grows, the optional CLI does the
same arithmetic faster:

```bash
hybrid-dispatcher stats            # all history (after npm link from cli/)
hybrid-dispatcher stats --last 10  # recent runs
hybrid-dispatcher stats --json     # for scripts
```

```
hybrid-dispatcher usage · all 3 runs · .dispatch-log.jsonl
  8 sub-agents · 222.5k tokens · 360s of agent time
  1 escalation(s) — a subtask came back untrusted and was re-run a tier up

  by tier:
    top     28.7k  12.9%  ███
    mid     82.0k  36.9%  █████████
    low    111.8k  50.2%  ████████████

  estimated ~71% cheaper than running every sub-agent at top tier
```

That last number is the point of the whole skill: whether tiering is actually paying off
on *your* work. Where a platform doesn't expose per-agent tokens, entries are logged as
`null` and counted separately — the skill never invents figures to fill the table.

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

## Optional: the companion CLI

Everything above works without it. The CLI ([`cli/`](cli/), zero runtime dependencies,
Node 18+) exists for the mechanical chores that get tedious by hand — and for Windows,
where the shell installer can't run. The skill suggests it when you hit one of these,
and otherwise does the work itself:

Build once from the checkout (`cd cli && npm install && npm run build && npm link`),
then:

```bash
hybrid-dispatcher install     # cross-platform install (incl. Windows)
hybrid-dispatcher init        # interactive strategy setup, with validation
hybrid-dispatcher doctor      # installs, gate blocks, config validity, compaction thresholds
hybrid-dispatcher stats       # token accounting over dispatch history
```

### Catching problems at session start

Rather than finding out mid-dispatch, wire the check into a `SessionStart` hook — its
stdout becomes context the agent can act on. In `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node <checkout>/cli/dist/index.js session-check" }] }
    ]
  }
}
```

It stays **silent when everything is fine** — it speaks only when the config is invalid,
missing in a project that opted into the gate, or collapsed against the model you just
launched with:

```
hybrid-dispatcher · session model claude-opus-5 · tiers top=inherit mid=opus low=sonnet · balanced
  ⚠ session model "claude-opus-5" matches tier mid ("opus") — top and mid are the same model
```

Two honest limits: the hook's `model` field is documented as optional, so when it is
absent the collapse check is skipped and the in-skill check at dispatch time covers it;
and a hook cannot change compaction settings for the session already running — it can
only tell you what to relaunch with.

`doctor` is the one worth knowing about — it answers "is this actually set up, and is my
mapping still sensible?" in one shot:

```
installation:
  ✓ Claude Code: skill installed (no global gate file; use a project CLAUDE.md gate)
  ✓ Codex: skill + gate installed
project config:
  ✓ config valid · claude-code · top=inherit mid=opus low=sonnet · balanced
  ⚠ session model "opus" matches tier mid ("opus") — top and mid are the same model
auto-compaction:
  ✓ Claude Code: compaction at 550k tokens (autoCompactWindow)
  ⚠ Gemini CLI: compaction at 90% of context — consider 50–60% for long-context models
```

What deliberately has **no** CLI equivalent: the tier rubric, task decomposition, and
verification strategy. Those are judgment, they live in `SKILL.md` as instructions for
the model, and encoding them as code would reduce "would I notice if this came back
wrong?" to keyword matching.

## Repository layout

- [`.claude/skills/hybrid-dispatcher/`](.claude/skills/hybrid-dispatcher/) — the skill:
  `SKILL.md` plus per-platform references (claude-code / codex / generic-cli) and
  task-type playbooks
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — this repo's own gate blocks
  (they double as working examples)
- [`cli/`](cli/) — optional TypeScript CLI (install / init / doctor / stats), zero runtime deps
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

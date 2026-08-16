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

One command — detects the agent systems on your machine, copies the skill, and
writes the gate blocks (idempotent; re-run to update):

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

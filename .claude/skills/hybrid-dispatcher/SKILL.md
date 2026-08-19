---
name: hybrid-dispatcher
description: Orchestrate complex multi-agent work by keeping all planning and synthesis in the main session (the user-selected model, e.g. Fable 5) while dispatching each sub-agent at the cheapest model tier that can do its job well (top/mid/low — on Claude Code: fable/opus/sonnet). Use this whenever a task will spawn multiple sub-agents or delegate subtasks — complex features, audits, migrations, research fan-outs, parallel reviews — and whenever the user mentions sub-agents, delegating, fanning out, model tiers, or saving cost/tokens on subtasks, even if they don't name specific models. Works on Claude Code, Codex, and other agent CLIs; on first use in a project it confirms the platform and writes a dispatch config.
---

# Tiered Model Dispatch

You are the **orchestrator**. You run on the model the user chose for this session — that choice is deliberate, and it exists precisely for the work only you should do: understanding intent, decomposing the task, deciding what to delegate, and synthesizing results. Sub-agents exist to do scoped work at the right price. The skill's whole value comes from getting that split right.

## First use in a project: init

Check for `.agent-dispatch.json` at the project root.

**If it exists**, read it and follow its platform, tier mapping, and budget mode. Skip to Dispatch.

**If it doesn't exist**, run init once:

1. **Detect the platform** from your own environment (which tools you have: an `Agent`/`Task` tool → Claude Code; a Codex sandbox → Codex; otherwise a generic CLI agent).
2. **Read the matching reference file** for how sub-agents are spawned and what model identifiers exist there:
   - `references/claude-code.md`
   - `references/codex.md`
   - `references/generic-cli.md` (any other agent)
3. **Propose the config to the user and confirm** — platform, the three tier→model mappings, and default budget mode. Two hard rules here:
   - **Tier models must come from the platform's own supported catalog.** On Claude Code that's fable/opus/sonnet/haiku; on Codex it's whatever `codex exec --help` / the user's plan lists; on anything else, whatever that CLI's model flag accepts. Never carry one vendor's model names onto another vendor's platform — the tier *roles* (top/mid/low) are portable, the identifiers are not. Model names drift over time, so verify against the platform's own help/docs before proposing.
   - **Install the skill the way the host system expects.** Claude Code discovers it via `.claude/skills/`; other systems have their own standing-instruction mechanism (Codex: `AGENTS.md`; others: see their docs). Each platform reference file has an "Install" section — follow it so the skill is natively discoverable there, rather than assuming Claude Code conventions exist.
   - **Surface the platform's auto-compaction setting** (multi-agent work fills context fast, and a forced mid-task compaction loses working state at the worst moment). Read it per the platform reference's "Compaction threshold" section, then present the trade rather than a number — on some platforms, including Claude Code, the compaction point *is* the usable ceiling, so compacting earlier means a smaller working window. State what the current value costs and let the user choose; write their answer to the platform's own config file, which stays the single source of truth, and tell them where it lives.

   This is the one moment this skill stops and asks; everything after runs autonomously.
4. **Write `.agent-dispatch.json`**:

```json
{
  "platform": "claude-code",
  "tiers": {
    "top": "fable",
    "mid": "opus",
    "low": "sonnet"
  },
  "budget_mode": "balanced",
  "top_tier_subagents": true,
  "confirmed": "2026-08-16"
}
```

`top_tier_subagents: false` means top tier is reserved for the main session: sub-agents
are capped at mid, and any subtask the rubric scores as top-tier (design, adversarial
verification) is either done in the main session or split until its pieces fit mid tier.
Offer this choice at init — some users want hard cost ceilings on delegated work.

The config is per-project and shared across platforms: if the user later opens the same project in Codex, the tier *roles* (top/mid/low) carry over and only the model identifiers need re-mapping — offer to add a second platform block rather than overwriting.

## Division of labor (never violate this)

**Stays in the main session — never delegated:**
- Understanding what the user actually wants
- Decomposing the task and deciding tiers
- Judging whether a sub-agent's result is good enough
- Final synthesis and the answer to the user

**Goes to sub-agents:** everything else that can be stated as a self-contained task with a checkable output.

The reason: delegation failures are almost never "the sub-agent's model was too weak" — they are "the orchestrator delegated judgment it should have kept." A sonnet-tier agent with a precise, self-contained prompt beats a fable-tier agent with a vague one.

## Scoring a subtask → choosing a tier

Score each subtask on four axes before spawning anything:

| Axis | Low | High |
|---|---|---|
| **Reasoning depth** | mechanical, procedural | open-ended design, subtle inference |
| **Spec ambiguity** | fully specified, one right answer | goal known, path unclear |
| **Blast radius** | wrong output is cheap to catch/redo | wrong output silently poisons downstream work |
| **Context integration** | one file / one source | cross-cutting, many interacting parts |

Then assign:

- **low tier** (sonnet-class): all four axes low. Search and exploration, reading files and summarizing, running tests and reporting output, mechanical edits from an exact spec, format conversions, gathering data.
- **mid tier** (opus-class): reasoning depth or context integration is moderate, but the spec is clear. Implementing a feature from a written plan, writing tests for known behavior, first-pass code review, routine debugging, drafting docs.
- **top tier** (fable-class): any axis is high. Architectural or API design, adversarial verification, debugging that has already resisted one attempt, security/concurrency reasoning, judging between competing outputs, anything whose failure you couldn't easily detect.

When torn between two tiers, ask: **"if this comes back wrong, will I notice?"** If yes (there's a test, a checkable artifact, or a downstream verifier), take the cheaper tier. If a wrong answer would look plausible and get absorbed, take the higher one. Verification asymmetry is your main cost lever: cheap generation + strong verification usually beats expensive generation with no check.

## Budget modes

The budget mode shifts the tier boundaries. It resolves in this order, highest first:

1. **What the user just said** — "do this cheaply" / "spare no expense" wins for that task, always.
2. **`HYBRID_DISPATCH_BUDGET`** — an environment variable holding `economy`, `balanced`, or `quality`. Check it before dispatching (`printenv HYBRID_DISPATCH_BUDGET`). Because environment variables are per-process, this is how two sessions on the same project run different strategies without fighting over one config file — one terminal launched with `HYBRID_DISPATCH_BUDGET=economy` explores cheaply while another on `quality` does release work. If it holds anything else, say so and fall back to the config rather than guessing.
3. **`budget_mode` in `.agent-dispatch.json`** — the project default.

Name the mode and, when it did not come from the config, where it came from — in the activation banner and in the run's log record, so history stays interpretable when sessions differed.

The three modes:

- **economy** — default one tier down whenever the output is verifiable downstream; reserve top tier for verification and final judgment only.
- **balanced** — the rubric above, as written.
- **quality** — critical-path subtasks go one tier up; verification always at top tier; prefer 2–3 independent attempts + judge over single attempts for design questions.

When the user states an explicit token/cost budget, plan the whole dispatch against it before spawning: count the subtasks, assume rough per-agent costs (low ≈ 1x, mid ≈ 3x, top ≈ 10x), and downgrade non-critical work first if it doesn't fit.

## Dispatch procedure

0. **Announce activation, after checking the mapping still holds.** Before printing the banner, compare the session's *current* model against the configured tiers — users switch models mid-project (`/model`), and a mapping that was sensible at init can quietly stop making sense. Two failure modes to detect:

   - **Tier collapse** — the session model equals the configured `mid` (or `low`) model, so `top` and that tier are the same thing and the split buys nothing. Example: config says `top: inherit, mid: opus` and the user switches the session to Opus.
   - **Inversion** — the session model is *weaker* than a lower tier's model, so "delegating down" would actually delegate up.

   When either fires, say so in one line and propose the shifted mapping, then continue with the current config unless the user takes the suggestion — a warning must never block the work:
   ```
   ⚠ session model is opus — same as tier mid, so top/mid are identical.
     Suggest: mid=sonnet, low=haiku for this session. Proceeding with current config.
   ```
   Only re-check when the session model differs from what the last dispatch saw; don't repeat an unheeded warning every turn within the same session. If the user accepts, update `.agent-dispatch.json` so it sticks.

   If the config carries `"collapse_ack": true`, the user has deliberately accepted a merged top/mid tier — stay silent about collapse (inversion still warns, since that one is never intentional). Offer to set this flag when a user waves the warning off, rather than making them see it again next session.

   Then print the banner so the user knows dispatch is being governed (they should never have to guess whether the skill ran):
   `⚡ hybrid-dispatcher · platform=<platform> · model=<session model> · budget=<mode>[ (env)|(said)] · <N> subtasks planned`
   The per-subtask assignment list (step 2) and the closing dispatch log are the other two visibility anchors — all three are mandatory output, not optional narration.
1. **Plan in the main session.** Decompose into subtasks with explicit inputs, outputs, and done-criteria. This is your job; do not spawn a "planner" sub-agent.
2. **Score and assign tiers** using the rubric. Say the assignments out loud briefly (one line per subtask) so the user can see the reasoning and object.
3. **Write self-contained prompts.** Sub-agents see nothing of this conversation. Each prompt carries: the task, file paths, relevant context pasted in, the expected output format, and what "done" looks like. A structured output schema when the platform supports it.
4. **Spawn independent tasks in parallel**, dependent ones in sequence. Use the platform's mechanics from the reference file you loaded at init. **Print one line per spawn as it goes out** — the user should see work leaving the session in real time, not only learn about it afterwards:
   `→ [S3] refactor db.py · mid/opus · spawned`
   and one line as each returns, carrying its cost:
   `← [S3] done · 42.1k tok · 68s`
5. **Verify before absorbing.** Cheap-tier outputs feeding into important decisions get checked — by a test, a script, or a top-tier verifier agent, per budget mode.
6. **Escalate on failure, don't loop.** If a sub-agent fails or returns something you don't trust, re-run **once** at the next tier up, with the failed attempt and why it was wrong included in the prompt. Never retry the same tier more than once, and never spiral more than two escalations — at that point the task decomposition was wrong; re-plan it yourself.
7. **Synthesize in the main session.** The final answer is yours, written from the results — not a pasted concatenation of sub-agent reports.
8. **Close with the dispatch log and the tally**, and append the run to the log file (see below).

## Logging and accounting

Two audiences: the user watching now (inline lines), and the user asking later "where did my tokens go" (the log file).

**In-session, at the end of every dispatch**, print the log plus a tally so cost is legible without leaving the conversation:

```
Dispatch log
| # | Task | Tier/model | Tokens | Time | Outcome |
|---|------|-----------|--------|------|---------|
| S1 | inventory error paths | low/sonnet | 12.4k | 31s | ok |
| S3 | refactor db.py | mid/opus | 42.1k | 68s | ok |
| S5 | adversarial review | top/inherit | 28.7k | 55s | 1 finding |
Total: 3 agents · 83.2k tokens · 154s wall · by tier: low 12.4k / mid 42.1k / top 28.7k
```

Token and duration figures come from whatever your platform reports when a sub-agent finishes — see the platform reference for where to read them. If a platform reports nothing, write `n/a` rather than guessing; a fabricated number is worse than a missing one.

**Record what actually ran, not just what you asked for.** Platforms substitute models silently when the requested one is unavailable (Claude Code warns and falls back; other platforms may not even warn). Wherever the platform exposes the served model — a substitution warning, headless `modelUsage`, the CLI's own usage line — put it in the record as `model_actual`, and flag the row in the in-session log when it differs from the request. When nothing verifies it, leave `model_actual` out; a tier-savings report built on assumed models is the kind of plausible-but-wrong number this skill exists to avoid.

**Persist each run** as one JSON line appended to `.dispatch-log.jsonl` at the project root (create it on first dispatch; it is per-project history, gitignore it):

```json
{"ts":"2026-08-16T14:22:31Z","task":"audit orderlib for bugs","platform":"claude-code","session_model":"opus","budget_mode":"economy","budget_source":"env","agents":[{"id":"S1","task":"inventory error paths","tier":"low","model":"sonnet","model_actual":"sonnet","tokens":12400,"seconds":31,"outcome":"ok"}],"totals":{"agents":3,"tokens":83200,"seconds":154,"by_tier":{"low":12400,"mid":42100,"top":28700}},"escalations":0}
```

Append it with a plain shell redirect — one line, no tooling needed, and appending (never rewriting) is what lets concurrent sessions share the file safely:

```bash
printf '%s\n' '<the json>' >> .dispatch-log.jsonl
```

**Reporting on history.** When the user asks what a project has cost ("这个项目花了多少 token", "which tier eats the most"), read `.dispatch-log.jsonl` and total it up yourself — it is a small file of flat records, and summing tokens by tier is arithmetic you can do directly. Report per-tier shares and, when it is informative, how the weighted spend compares with running everything at top tier (low≈1x, mid≈3x, top≈10x).

## Optional: the companion CLI

Everything above works with no dependencies. A small CLI exists for the mechanical chores that get tedious by hand — mention it **only when the user hits one of these**, and never as an upsell:

| When | Suggest |
|---|---|
| History has grown past a few dozen runs, or they ask for it repeatedly | `hybrid-dispatcher stats` — same numbers, computed rather than eyeballed |
| Something seems misconfigured, or the skill isn't triggering on another platform | `hybrid-dispatcher doctor` — checks installs, gate blocks, config validity, compaction thresholds |
| They want the skill on another machine — especially **Windows**, where the shell installer doesn't run | `hybrid-dispatcher install` |
| They ask to redo init non-interactively | `hybrid-dispatcher init` |

| They want problems caught at session start rather than at dispatch | wire `hybrid-dispatcher session-check` into a `SessionStart` hook — it prints only when the config is broken, missing, or collapsed against the session's model, and stays silent otherwise |

The CLI is not on npm yet — it comes from the repo checkout (`cli/`, `npm link`); check `command -v hybrid-dispatcher` before suggesting it, and never suggest `npx` for an unpublished name. If the CLI is absent, do the work yourself as described above; a missing optional tool is never a reason to stall. The judgment half of this skill — the rubric, decomposition, verification strategy — has no CLI equivalent by design and stays here.

## Task-type playbooks

The rubric is general; common task types have known dispatch shapes. Once you know what kind of job this is — research/investigation (调研), development (研发), documentation (文档), audit/review (审计), or a mix — read `references/task-playbooks.md` and start from that type's stage-by-stage tier preset instead of scoring every subtask from scratch. The playbooks encode where verification is cheap for each task type, which is what actually moves tier assignments.

## Reference files

Read the one matching the configured platform when you need spawn mechanics or model identifiers:

- `references/claude-code.md` — Agent tool / Workflow tool, `model` and `effort` parameters, parallel spawning
- `references/codex.md` — spawning via `codex exec` subprocesses, reasoning-effort mapping
- `references/generic-cli.md` — the questions to answer to onboard any other agent CLI, and the config shape to record
- `references/task-playbooks.md` — stage-by-stage tier presets per task type (research / development / documentation / audit / mixed)

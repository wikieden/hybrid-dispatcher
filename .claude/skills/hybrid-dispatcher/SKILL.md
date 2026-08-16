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
  "confirmed": "2026-08-16"
}
```

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

The config's `budget_mode` (the user can also override per-task: "do this cheaply" / "spare no expense") shifts the tier boundaries:

- **economy** — default one tier down whenever the output is verifiable downstream; reserve top tier for verification and final judgment only.
- **balanced** — the rubric above, as written.
- **quality** — critical-path subtasks go one tier up; verification always at top tier; prefer 2–3 independent attempts + judge over single attempts for design questions.

When the user states an explicit token/cost budget, plan the whole dispatch against it before spawning: count the subtasks, assume rough per-agent costs (low ≈ 1x, mid ≈ 3x, top ≈ 10x), and downgrade non-critical work first if it doesn't fit.

## Dispatch procedure

0. **Announce activation.** The moment this skill takes over, print one visible line so the user knows dispatch is being governed (they should never have to guess whether the skill ran):
   `⚡ hybrid-dispatcher · platform=<platform> · budget=<mode> · <N> subtasks planned`
   The per-subtask assignment list (step 2) and the closing dispatch log are the other two visibility anchors — all three are mandatory output, not optional narration.
1. **Plan in the main session.** Decompose into subtasks with explicit inputs, outputs, and done-criteria. This is your job; do not spawn a "planner" sub-agent.
2. **Score and assign tiers** using the rubric. Say the assignments out loud briefly (one line per subtask) so the user can see the reasoning and object.
3. **Write self-contained prompts.** Sub-agents see nothing of this conversation. Each prompt carries: the task, file paths, relevant context pasted in, the expected output format, and what "done" looks like. A structured output schema when the platform supports it.
4. **Spawn independent tasks in parallel**, dependent ones in sequence. Use the platform's mechanics from the reference file you loaded at init.
5. **Verify before absorbing.** Cheap-tier outputs feeding into important decisions get checked — by a test, a script, or a top-tier verifier agent, per budget mode.
6. **Escalate on failure, don't loop.** If a sub-agent fails or returns something you don't trust, re-run **once** at the next tier up, with the failed attempt and why it was wrong included in the prompt. Never retry the same tier more than once, and never spiral more than two escalations — at that point the task decomposition was wrong; re-plan it yourself.
7. **Synthesize in the main session.** The final answer is yours, written from the results — not a pasted concatenation of sub-agent reports.

## Task-type playbooks

The rubric is general; common task types have known dispatch shapes. Once you know what kind of job this is — research/investigation (调研), development (研发), documentation (文档), audit/review (审计), or a mix — read `references/task-playbooks.md` and start from that type's stage-by-stage tier preset instead of scoring every subtask from scratch. The playbooks encode where verification is cheap for each task type, which is what actually moves tier assignments.

## Reference files

Read the one matching the configured platform when you need spawn mechanics or model identifiers:

- `references/claude-code.md` — Agent tool / Workflow tool, `model` and `effort` parameters, parallel spawning
- `references/codex.md` — spawning via `codex exec` subprocesses, reasoning-effort mapping
- `references/generic-cli.md` — the questions to answer to onboard any other agent CLI, and the config shape to record
- `references/task-playbooks.md` — stage-by-stage tier presets per task type (research / development / documentation / audit / mixed)

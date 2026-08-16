# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Multi-agent dispatch (mandatory gate)

Before spawning any sub-agent or delegating any subtask in this project, invoke the
`hybrid-dispatcher` skill and follow it. Do this deterministically — do not rely
on the skill triggering from its description. The skill keeps planning and synthesis
in the main session (the user-selected model) and assigns each sub-agent the cheapest
model tier that fits its difficulty and the budget mode.

- Dispatch config: `.agent-dispatch.json` at the project root (created by the skill's
  init on first use; confirm the tier mapping with the user then).
- Task-type presets (research / development / documentation / audit): see
  `.claude/skills/hybrid-dispatcher/references/task-playbooks.md`.
- Other agents (Codex etc.) get the same instruction via `AGENTS.md`.

## Repository layout

- `.claude/skills/hybrid-dispatcher/` — the skill itself (SKILL.md + per-platform
  references). This repo is the skill's home; edits to dispatch behavior go here.
- `dispatch-workspace/` — eval fixtures, benchmark results, and trigger
  optimization reports from skill-creator iterations. Not part of the skill; safe to
  regenerate.

# Platform: Codex (OpenAI Codex CLI)

Codex has no native sub-agent tool; sub-agents are one-shot `codex exec` subprocesses. The orchestrator is the interactive Codex session the user launched (their chosen model = top tier for judgment, kept in-session).

## Install on Codex

Codex does not read `.claude/skills/`. Its standing-instruction mechanism is `AGENTS.md`, discovered at the repo root (project scope) and `~/.codex/AGENTS.md` (global scope). To install:

1. Keep the skill folder wherever it lives (e.g. `.claude/skills/hybrid-dispatcher/` in a shared repo, or any readable path) — Codex can Read the files; only discovery needs bridging.
2. Add to the repo's `AGENTS.md` (create it if absent): a short block instructing the agent to read this SKILL.md and follow it before spawning any `codex exec` sub-process, with the path spelled out.
3. For cross-project use, put the same block in `~/.codex/AGENTS.md` with an absolute path to a copy of the skill folder.
4. Model identifiers in `.agent-dispatch.json` must be **OpenAI models this Codex install supports** — enumerate via `codex exec --help`, the user's `~/.codex/config.toml`, or ask the user which models their plan includes. Never write Claude model names into a Codex config.

## Tier → model mapping (VERIFY AT INIT — OpenAI model names drift)

At init, run `codex exec --help` and check the current model list (or ask the user which models their plan includes) before proposing:

| Tier | Suggested mapping (verify) | Lever |
|---|---|---|
| top | the session's own model at high/xhigh reasoning effort (e.g. `gpt-5.x-codex` + `model_reasoning_effort="xhigh"`) | effort up |
| mid | same family at `medium` effort, or the standard codex model | effort/base |
| low | the `-mini` variant, or `low` effort | smaller model |

On Codex, **reasoning effort is the primary tier lever** (one model family, effort levels), unlike Claude Code where distinct models are the lever. Record whatever the user confirms into `.agent-dispatch.json` as literal flag values, e.g.:

```json
"tiers": {
  "top": {"model": "gpt-5.x-codex", "config": "model_reasoning_effort=\"xhigh\""},
  "mid": {"model": "gpt-5.x-codex", "config": "model_reasoning_effort=\"medium\""},
  "low": {"model": "gpt-5.x-codex-mini", "config": "model_reasoning_effort=\"low\""}
}
```

## Spawning a sub-agent

```bash
codex exec -m <model> -c model_reasoning_effort="<effort>" \
  --output-last-message /tmp/dispatch/task-1.md \
  "<self-contained prompt>" &
```

- **Parallel**: launch multiple `codex exec` processes in the background (`&`), collect with `wait`. Cap concurrency (~4–8) — each is a full agent.
- **Output**: `--output-last-message <file>` captures the agent's final message; have the prompt demand a structured final message (e.g. "end with a JSON block matching …") since there is no schema enforcement.
- **Sandbox/approvals**: sub-processes need non-interactive settings — `--full-auto` or an explicit `--sandbox` mode consistent with what the user allowed the main session. Never grant a sub-agent broader permissions than the session has.
- **Context**: each subprocess starts cold in the working directory. The prompt must name the files to read; there is no shared conversation.

## Reading per-agent cost (for the dispatch log)

`codex exec` prints a token summary to stderr on completion; capture it per sub-process (`2> /tmp/dispatch/task-1.err`) and parse the totals, or read the session's own usage line. If a run yields nothing parseable, log `"tokens": null` — the stats script counts those separately rather than skewing the totals.

## Compaction threshold (checked at init)

Config file: `~/.codex/config.toml`.

- `model_auto_compact_token_limit` — absolute token count; pair it with `model_context_window` to compute the percentage. Propose 50–60% of the window for 1M+ windows (e.g. `550000` for 1M), ~75% for smaller windows. If the existing value is already at or below the proposed one, leave it alone and say so.

The user edits config.toml directly to change it later.

## Escalation mechanics

Re-run `codex exec` with the next tier's flags, prepending the failed attempt's output and a one-paragraph diagnosis to the prompt. Subprocesses keep no state, so escalation always carries context in the prompt.

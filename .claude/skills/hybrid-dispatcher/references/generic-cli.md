# Platform: any other agent CLI

To onboard a new platform at init, answer these six questions (from the tool's `--help`, its docs, or the user), then record the answers in `.agent-dispatch.json`:

1. **One-shot invocation** — what command runs a single non-interactive task and exits? (the `claude -p` / `codex exec` equivalent)
2. **Model selection** — which flag or config key picks the model, and what are the current identifiers for a strong / standard / fast model **from this platform's own catalog**? Some platforms tier by reasoning-effort setting instead of model name — either works; record the literal flags. Never map tiers to another vendor's model names: the tier roles travel, the identifiers don't.
3. **Output capture** — how do you get the final answer? (stdout, an output-file flag, a JSON mode?) Prefer a mode you can parse; otherwise instruct the agent to end with a fenced JSON block.
4. **Permissions** — what flags make it run non-interactively without prompting, and what's the safe sandbox setting matching what the user allowed the main session?
5. **Concurrency** — anything preventing parallel processes (lockfiles, rate limits)? Default cap 4–8.
6. **Standing-instruction mechanism (install)** — where does this system load persistent instructions from (`AGENTS.md`, `GEMINI.md`, a rules directory, a config key)? Install the skill *that* way: add a block there telling the agent to read this SKILL.md (path spelled out) and follow it before spawning sub-agents. Don't assume a `.claude/skills/`-style registry exists.
7. **Auto-compaction threshold** — does the platform expose one, and in what unit? (Gemini CLI: `chatCompression.contextPercentageThreshold` in `~/.gemini/settings.json`, a fraction — 0.55 for long-context; opencode: no threshold, only `compaction.auto`/`prune` booleans in `opencode.json`.) If configurable and at default, propose 50–60% of the window for 1M+ models, ~75% for ~200K, write it to the platform's config on confirmation, and tell the user where to change it later. If not configurable, enable whatever pruning/compaction switches exist and note the limitation.
8. **Per-agent cost reporting** — does the platform report tokens/duration when a sub-agent finishes (stdout, stderr, a JSON field, a usage command)? Capture whatever exists for the dispatch log; where nothing is exposed, log `null` and tell the user that tier accounting is unavailable on this platform instead of inventing figures.

Record as:

```json
{
  "platform": "<name>",
  "spawn": "<command template with {model} {prompt} {output} slots>",
  "tiers": {
    "top": "<literal model/flag value>",
    "mid": "<...>",
    "low": "<...>"
  },
  "budget_mode": "balanced"
}
```

Everything else in SKILL.md — the rubric, budget modes, escalation, division of labor — is platform-neutral and applies unchanged. The orchestrator is always the interactive session the user launched; sub-agents are always background one-shot runs with self-contained prompts.

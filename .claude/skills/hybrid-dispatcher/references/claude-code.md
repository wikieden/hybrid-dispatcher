# Platform: Claude Code

## Tier → model mapping (default)

| Tier | Model param | Notes |
|---|---|---|
| top | *(omit)* or `"fable"` | Omitting `model` inherits the main session's model — if the user is running Fable 5, that IS the top tier. Prefer omitting so the mapping tracks whatever the user selects. |
| mid | `"opus"` | |
| low | `"sonnet"` | For truly trivial bulk work (mass file reads, grep sweeps), `"haiku"` exists one tier below. |

## Spawning sub-agents: the Agent tool

```
Agent({
  subagent_type: "general-purpose",   // or "Explore" for read-only search
  model: "sonnet",                    // tier assignment; omit to inherit (= top tier)
  description: "Audit auth module",
  prompt: "<self-contained prompt>"
})
```

- **Parallel**: put multiple Agent calls in one message — they run concurrently.
- Agents run in the background by default; you're notified on completion. Use `run_in_background: false` only when your very next step depends on the result.
- Use `SendMessage` with the agent's name to continue a previous agent with its context intact (e.g., escalating with feedback while keeping what it already read).
- Built-in read-only agent types (`Explore`, `Plan`) are natural low/mid-tier citizens; pair them with an explicit `model` to control cost.

## Large fan-outs: the Workflow tool

Only when the user has opted into multi-agent orchestration (ultracode, "use a workflow", etc.). Per-agent tier control:

```js
agent(prompt, {
  model: "sonnet",     // tier; omit to inherit the session model (= top)
  effort: "low",       // reasoning effort: low|medium|high|xhigh|max — a second, finer cost lever
  schema: SCHEMA       // structured output; use it so results need no parsing
})
```

Tier guidance inside workflows:
- Finder/sweep stages → `model: "sonnet", effort: "low"`.
- Implementation stages → `model: "opus"`.
- Verify/judge stages → omit `model` (inherit top tier), raise `effort` for the hardest judgments.
- `effort` stacks with `model`: a `sonnet`+`low` sweep and an inherited-model `xhigh` judge can differ ~50x in cost. Use both levers.

## Detecting the session model (for the tier-collapse check)

The session model is named in your own system prompt ("You are powered by the model named …"). Compare it against the config's `mid`/`low` values by family name (fable / opus / sonnet / haiku), not exact IDs — `claude-opus-5` and `opus` are the same tier.

Sensible shifted mappings when the session model moves:

| Session model | Suggested mapping |
|---|---|
| Fable | `top: inherit, mid: opus, low: sonnet` (the default) |
| Opus | `top: inherit, mid: sonnet, low: haiku` |
| Sonnet | `top: inherit, mid: haiku, low: haiku` — or tell the user delegation saves little here and most work should stay in-session |

## Compaction threshold (checked at init)

Settings file: `~/.claude/settings.json` (user-global; changes take effect next session).

- `autoCompactWindow` — **absolute token count**, not a percentage: compaction triggers as usage approaches this value. Propose ~`550000` for 1M-window sessions (≈55%), ~`120000–150000` for 200K-window sessions (≈60–75%). Caveat to tell the user: one global number can't fit both — if it exceeds the current model's window, that session falls back to default timing.
- `precomputeCompactionEnabled: true` — pre-computes the summary in the background so triggering doesn't stall the session; propose it alongside.

The user edits this file directly to change either later; this skill only proposes at init.

## Escalation mechanics

Re-running at a higher tier = new Agent call with the higher (or omitted) `model`, prompt now including the failed attempt and what was wrong with it. If the original agent's context is valuable (it read many files), prefer `SendMessage` to that agent instead — but note SendMessage cannot change its model; escalating the model requires a fresh agent.

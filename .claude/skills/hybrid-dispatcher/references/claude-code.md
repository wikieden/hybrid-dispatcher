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

## Reading per-agent cost (for the dispatch log)

When a background Agent finishes, its completion notification carries `total_tokens` and `duration_ms` — that is the only place these appear, and they are not recoverable later. Record them the moment each notification arrives (not batched at the end), then use them for the closing tally and the `.dispatch-log.jsonl` entry.

Caveats worth passing to the user rather than papering over:
- An agent that spawns its own sub-agents reports **its own** tokens; nested agents notify separately. Sum them if you want the true subtree cost, and say which you reported.
- An agent resumed with `SendMessage` notifies again — add the segments rather than overwriting, or the first leg vanishes from the tally.
- Workflow-tool runs report per-agent totals through the workflow journal instead; `budget.spent()` gives the running total inside a script.
- **Verifying the served model**: interactive sessions print a warning naming requested and substituted models when a sub-agent's model is swapped — capture it into `model_actual`. Headless runs expose the truth in the result's `modelUsage` field. The background Agent notification does not name the model, so absent a warning, treat the request as unverified rather than confirmed.

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

- `autoCompactWindow` — absolute token count (100000–1000000) marking how full the context gets before Claude Code compacts. **It doubles as a ceiling**: since compaction fires there, the session never uses more than that, and the displayed window shrinks to match. Lowering it to "compact earlier" and "keep the full window" are not both available here — present that trade instead of proposing a value. Unset means Claude Code picks a window tuned for the model.
- `autoCompactEnabled` — whether auto-compaction happens at all (default true).
- `precomputeCompactionEnabled: true` — pre-computes the summary in the background so triggering doesn't stall the session. No effect on window size; safe to suggest on its own.

Per-session alternatives that don't touch global settings: the `/autocompact` command, the `--autocompact <tokens>` launch flag, and `CLAUDE_CODE_AUTO_COMPACT_WINDOW`.



## Escalation mechanics

Re-running at a higher tier = new Agent call with the higher (or omitted) `model`, prompt now including the failed attempt and what was wrong with it. If the original agent's context is valuable (it read many files), prefer `SendMessage` to that agent instead — but note SendMessage cannot change its model; escalating the model requires a fresh agent.

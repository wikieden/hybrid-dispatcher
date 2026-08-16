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

## Escalation mechanics

Re-running at a higher tier = new Agent call with the higher (or omitted) `model`, prompt now including the failed attempt and what was wrong with it. If the original agent's context is valuable (it read many files), prefer `SendMessage` to that agent instead — but note SendMessage cannot change its model; escalating the model requires a fresh agent.

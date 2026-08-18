# hybrid-dispatcher CLI

Companion tooling for the [hybrid-dispatcher](https://github.com/wikieden/hybrid-dispatcher)
agent skill — tiered model dispatch for multi-agent work.

**The skill itself needs none of this.** It is plain markdown that any agent reads and
follows. This CLI handles the mechanical chores around it: installing across agent
systems (including Windows, where the shell installer can't run), validating the
per-project strategy file, and accounting for token spend.

```bash
npx hybrid-dispatcher install     # copy the skill + write gate blocks for every agent system found
npx hybrid-dispatcher init        # interactive strategy setup -> .agent-dispatch.json
npx hybrid-dispatcher doctor      # installs, gate blocks, config validity, compaction thresholds
npx hybrid-dispatcher stats       # token accounting over .dispatch-log.jsonl
npx hybrid-dispatcher log '<json>' # append one run record (the skill calls this)
```

Supported agent systems: Claude Code, Codex, Gemini CLI, opencode. Config locations
follow each platform's own convention per OS (XDG on Linux/macOS, `%APPDATA%` on Windows).

Node 18+. No runtime dependencies.

## What this deliberately does not do

Tier selection, task decomposition, and verification strategy stay in `SKILL.md` as
instructions for the model. They are judgment calls — "would I notice if this came back
wrong?" — and turning them into code would reduce them to keyword matching.

MIT

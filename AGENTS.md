# AgentTeams

## Multi-agent work in this project

Before spawning sub-agents or delegating subtasks in this project, read and follow
`.claude/skills/hybrid-dispatcher/SKILL.md`. It defines:

- planning and synthesis stay in the main session (the model the user selected);
- each sub-agent runs at the cheapest model tier (top/mid/low) that fits its
  difficulty and the budget mode;
- platform-specific spawn mechanics live in
  `.claude/skills/hybrid-dispatcher/references/` (Claude Code, Codex, generic CLI).

If `.agent-dispatch.json` does not exist at the project root, run the skill's
init step first: detect your platform, confirm the tier→model mapping with the
user, and write the config.

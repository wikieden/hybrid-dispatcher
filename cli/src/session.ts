/**
 * `session-check` — meant to run from a SessionStart hook.
 *
 * Design rule: say nothing when everything is fine. This runs at the top of every
 * session and its stdout is injected into the model's context, so a chatty check
 * would tax every conversation forever to report news exactly once.
 *
 * What it can and cannot do is worth being clear about: it can tell you a setting
 * is wrong for the model you just launched, but it cannot change that setting for
 * the session already running — compaction config is read at startup. So advice
 * here is phrased as something the user can act on (relaunch flag, config edit),
 * never as something already applied.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig, tierModel, tierWarnings, validate, CONFIG_FILE } from "./config.js";

export interface HookInput {
  model?: string | { id?: string; display_name?: string };
  cwd?: string;
  hook_event_name?: string;
}

/** The `model` field is documented as optional — never assume it is there. */
export function modelName(m: HookInput["model"]): string | undefined {
  if (!m) return undefined;
  if (typeof m === "string") return m;
  return m.id ?? m.display_name;
}

/** A project opts into the gate by mentioning the skill in CLAUDE.md / AGENTS.md. */
function projectUsesSkill(cwd: string): boolean {
  for (const f of ["CLAUDE.md", "AGENTS.md"]) {
    const p = join(cwd, f);
    if (existsSync(p) && readFileSync(p, "utf8").includes("hybrid-dispatcher")) return true;
  }
  return false;
}

export function sessionCheck(input: HookInput, opts: { compaction?: boolean } = {}): string[] {
  const cwd = input.cwd ?? process.cwd();
  const model = modelName(input.model);
  const lines: string[] = [];

  const cfg = readConfig(cwd);
  if (!cfg) {
    // Only nudge where the project has actually opted in; otherwise stay quiet.
    if (projectUsesSkill(cwd))
      lines.push(`no ${CONFIG_FILE} in this project yet — run \`npx hybrid-dispatcher init\` before dispatching sub-agents.`);
    return lines;
  }

  const errs = validate(cfg);
  if (errs.length) {
    lines.push(`${CONFIG_FILE} has problems: ${errs.join("; ")}`);
    return lines;
  }

  // Tier collapse against the model actually running this session.
  for (const w of tierWarnings(cfg, model)) lines.push(w);

  if (opts.compaction && model) {
    const s = compactionNote(model);
    if (s) lines.push(s);
  }

  if (!lines.length) return [];
  return [
    `hybrid-dispatcher · session model ${model ?? "unknown"} · tiers ` +
      `top=${tierModel(cfg.tiers.top)} mid=${tierModel(cfg.tiers.mid)} low=${tierModel(cfg.tiers.low)} · ${cfg.budget_mode}`,
    ...lines.map((l) => `  ⚠ ${l}`),
  ];
}

/**
 * Claude Code's `autoCompactWindow` sets the point at which the context counts as
 * full, which means it doubles as a ceiling on the usable window. That trade is
 * easy to set without realising, so surface it rather than recommend a number.
 */
function compactionNote(_model: string): string | null {
  const settings = join(process.env["HOME"] ?? "", ".claude", "settings.json");
  if (!existsSync(settings)) return null;
  try {
    const s = JSON.parse(readFileSync(settings, "utf8")) as { autoCompactWindow?: number };
    if (typeof s.autoCompactWindow !== "number") return null;
    return (
      `autoCompactWindow is ${(s.autoCompactWindow / 1000).toFixed(0)}k — compaction fires there, ` +
      `so that is also the effective ceiling for this session. Remove it for the model's full window, ` +
      `or relaunch with \`--autocompact <tokens>\` to pick a different point.`
    );
  } catch {
    return null;
  }
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

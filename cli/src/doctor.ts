/**
 * `doctor` — answer "is this set up correctly, and is it still sensible?"
 *
 * Split into three checks because they fail for different reasons: installation
 * (did the files land), config (is the strategy well-formed and still meaningful),
 * and compaction (is the host about to force a mid-task compaction on you).
 */
import { existsSync, readFileSync } from "node:fs";
import { PLATFORMS, type Platform } from "./platforms.js";
import { hasGate, isInstalled } from "./install.js";
import { effectiveBudget, readConfig, tierModel, tierWarnings, validate } from "./config.js";

export type Level = "ok" | "warn" | "error" | "info";
export interface Finding { level: Level; text: string }

const ICON: Record<Level, string> = { ok: "✓", warn: "⚠", error: "✗", info: "·" };
export const icon = (l: Level): string => ICON[l];

export function checkInstalls(): Finding[] {
  const out: Finding[] = [];
  for (const p of PLATFORMS) {
    if (!existsSync(p.configDir)) { out.push({ level: "info", text: `${p.label}: not installed on this machine` }); continue; }
    if (!isInstalled(p)) { out.push({ level: "warn", text: `${p.label}: skill missing — run \`hybrid-dispatcher install\`` }); continue; }
    if (p.gateFile && !hasGate(p))
      out.push({ level: "warn", text: `${p.label}: skill present but no gate block in ${p.gateFile} — it may never trigger` });
    else if (!p.gateFile)
      out.push({ level: "ok", text: `${p.label}: skill installed (no global gate file; use a project CLAUDE.md gate)` });
    else out.push({ level: "ok", text: `${p.label}: skill + gate installed` });
  }
  return out;
}

export function checkConfig(sessionModel?: string, cwd = process.cwd()): Finding[] {
  const cfg = readConfig(cwd);
  if (!cfg) return [{ level: "warn", text: "no .agent-dispatch.json in this project — run `hybrid-dispatcher init`" }];

  const errs = validate(cfg);
  if (errs.length) return errs.map((e) => ({ level: "error" as const, text: `config: ${e}` }));

  const budget = effectiveBudget(cfg);
  const out: Finding[] = [{
    level: "ok",
    text: `config valid · ${cfg.platform} · top=${tierModel(cfg.tiers.top)} mid=${tierModel(cfg.tiers.mid)} ` +
          `low=${tierModel(cfg.tiers.low)} · ${budget.mode}` +
          (budget.source === "env" ? ` (from ${"HYBRID_DISPATCH_BUDGET"} — this session only)` : ""),
  }];
  if (budget.warning) out.push({ level: "warn", text: budget.warning });
  for (const w of tierWarnings(cfg, sessionModel)) out.push({ level: "warn", text: w });
  if (cfg.top_tier_subagents === false)
    out.push({ level: "info", text: "sub-agents capped at mid tier (top reserved for the main session)" });
  return out;
}

/**
 * Compaction thresholds are per-platform and in different units, so this reports
 * rather than judges — except where a value is plainly late for long contexts.
 */
export function checkCompaction(): Finding[] {
  const out: Finding[] = [];
  for (const p of PLATFORMS) {
    if (!existsSync(p.configDir) || p.compaction.unit === "none") continue;
    const f = p.compaction.file;
    if (!existsSync(f)) { out.push({ level: "warn", text: `${p.label}: no ${f} — compaction threshold unset (defaults are late)` }); continue; }
    const val = readThreshold(readFileSync(f, "utf8"), p);
    if (val === null) {
      out.push({ level: "warn", text: `${p.label}: ${p.compaction.key} not set in ${f} — default triggers late; 50–60% of window suits 1M+ contexts` });
    } else if (p.compaction.unit === "fraction") {
      const late = val > 0.65;
      out.push({ level: late ? "warn" : "ok", text: `${p.label}: compaction at ${(val * 100).toFixed(0)}% of context${late ? " — consider 50–60% for long-context models" : ""}` });
    } else {
      out.push({ level: "ok", text: `${p.label}: compaction at ${(val / 1000).toFixed(0)}k tokens (${p.compaction.key})` });
    }
  }
  return out;
}

function readThreshold(raw: string, p: Platform): number | null {
  const key = p.compaction.key;
  if (p.compaction.file.endsWith(".toml")) {
    const m = raw.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)`, "m"));
    return m?.[1] ? Number(m[1]) : null;
  }
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], json);
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export function runDoctor(sessionModel?: string, cwd = process.cwd()): { findings: Finding[]; exitCode: number } {
  const findings: Finding[] = [];
  findings.push({ level: "info", text: "installation" }, ...checkInstalls());
  findings.push({ level: "info", text: "project config" }, ...checkConfig(sessionModel, cwd));
  const comp = checkCompaction();
  if (comp.length) findings.push({ level: "info", text: "auto-compaction" }, ...comp);
  return { findings, exitCode: findings.some((f) => f.level === "error") ? 1 : 0 };
}

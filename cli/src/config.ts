/**
 * .agent-dispatch.json — per-project dispatch strategy.
 *
 * Validation matters here because the file is hand-edited: a typo in a tier name
 * silently changes which model does the work, and the skill would happily follow
 * it. Better to fail loudly at `doctor`/`init` time than to quietly dispatch wrong.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { PlatformKey } from "./platforms.js";

export const CONFIG_FILE = ".agent-dispatch.json";
export const LOG_FILE = ".dispatch-log.jsonl";

export type BudgetMode = "economy" | "balanced" | "quality";
export const BUDGET_MODES: BudgetMode[] = ["economy", "balanced", "quality"];

/** A tier maps to a model id, or to a structured spawn spec on platforms that tier by effort. */
export type TierValue = string | { model: string; config?: string };

export interface DispatchConfig {
  platform: PlatformKey | string;
  tiers: { top: TierValue; mid: TierValue; low: TierValue };
  budget_mode: BudgetMode;
  /** false = top tier reserved for the main session; sub-agents capped at mid. */
  top_tier_subagents?: boolean;
  /** true = user deliberately accepted a merged top/mid tier; silence that warning. */
  collapse_ack?: boolean;
  confirmed?: string;
  /** Additional platform blocks for the same project (same tier roles, different ids). */
  platforms?: Record<string, { tiers: DispatchConfig["tiers"] }>;
}

export function configPath(cwd = process.cwd()): string {
  return join(cwd, CONFIG_FILE);
}

export function readConfig(cwd = process.cwd()): DispatchConfig | null {
  const p = configPath(cwd);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as DispatchConfig;
}

export function writeConfig(cfg: DispatchConfig, cwd = process.cwd()): string {
  const p = configPath(cwd);
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  return p;
}

export function tierModel(v: TierValue): string {
  return typeof v === "string" ? v : v.model;
}

export const BUDGET_ENV = "HYBRID_DISPATCH_BUDGET";

export interface EffectiveBudget {
  mode: BudgetMode;
  source: "env" | "config";
  /** Set when the env var held something unusable — surfaced, never silently dropped. */
  warning?: string;
}

/**
 * Sessions are processes, so an environment variable is the natural way to give
 * two windows on the same project different strategies without them fighting over
 * one config file. Spoken instructions still outrank this; the skill applies those.
 */
export function effectiveBudget(cfg: DispatchConfig, env: NodeJS.ProcessEnv = process.env): EffectiveBudget {
  const raw = env[BUDGET_ENV]?.trim();
  if (!raw) return { mode: cfg.budget_mode, source: "config" };
  if (BUDGET_MODES.includes(raw as BudgetMode)) return { mode: raw as BudgetMode, source: "env" };
  return {
    mode: cfg.budget_mode,
    source: "config",
    warning: `${BUDGET_ENV}="${raw}" is not one of ${BUDGET_MODES.join(" | ")} — using ${cfg.budget_mode} from config`,
  };
}

/** Returns human-readable problems; empty array means the config is usable. */
export function validate(cfg: unknown): string[] {
  const errs: string[] = [];
  if (typeof cfg !== "object" || cfg === null) return ["config is not a JSON object"];
  const c = cfg as Partial<DispatchConfig>;

  if (!c.platform) errs.push("missing `platform`");
  if (!c.tiers) {
    errs.push("missing `tiers`");
  } else {
    for (const t of ["top", "mid", "low"] as const) {
      const v = c.tiers[t];
      if (v === undefined) errs.push(`missing tier \`${t}\``);
      else if (typeof v !== "string" && typeof (v as { model?: string }).model !== "string")
        errs.push(`tier \`${t}\` must be a model name or {model, config}`);
    }
  }
  if (c.budget_mode && !BUDGET_MODES.includes(c.budget_mode))
    errs.push(`budget_mode must be one of ${BUDGET_MODES.join(" | ")} (got "${c.budget_mode}")`);
  for (const flag of ["top_tier_subagents", "collapse_ack"] as const)
    if (c[flag] !== undefined && typeof c[flag] !== "boolean") errs.push(`\`${flag}\` must be true or false`);
  return errs;
}

/**
 * Tier sanity, independent of validity: a mapping can be well-formed and still
 * pointless. Reported as warnings so nothing blocks on them.
 */
export function tierWarnings(cfg: DispatchConfig, sessionModel?: string): string[] {
  const out: string[] = [];
  const top = tierModel(cfg.tiers.top);
  const mid = tierModel(cfg.tiers.mid);
  const low = tierModel(cfg.tiers.low);

  if (mid === low) out.push(`tiers mid and low are both "${mid}" — the split buys nothing`);
  if (top !== "inherit" && top === mid && !cfg.collapse_ack)
    out.push(`tiers top and mid are both "${top}" — set "collapse_ack": true if that is deliberate`);

  // `top: inherit` means the session model IS the top tier, so it collapses against
  // whatever model the user is actually running right now.
  if (top === "inherit" && sessionModel && !cfg.collapse_ack) {
    const s = sessionModel.toLowerCase();
    for (const [name, value] of [["mid", mid], ["low", low]] as const)
      if (s.includes(value.toLowerCase()))
        out.push(
          `session model "${sessionModel}" matches tier ${name} ("${value}") — top and ${name} are the same model`,
        );
  }
  return out;
}

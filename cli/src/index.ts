#!/usr/bin/env node
/**
 * hybrid-dispatcher CLI — the mechanical half of the skill.
 *
 * The judgment half (the tier rubric, task decomposition, verification strategy)
 * lives in SKILL.md as instructions for the model, and deliberately stays there:
 * encoding "would I notice if this came back wrong?" as code would reduce it to
 * keyword matching. This binary handles what code is actually better at —
 * installing across platforms, validating config, and accounting for spend.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { stdin, stdout } from "node:process";
import { BUDGET_MODES, effectiveBudget, readConfig, tierWarnings, writeConfig, validate, type BudgetMode, type DispatchConfig } from "./config.js";
import { detectPlatforms, installTo, uninstallFrom, SKILL_NAME } from "./install.js";
import { icon, runDoctor } from "./doctor.js";
import { appendRun, loadRuns, type RunRecord } from "./log.js";
import { renderSummary, summarize } from "./stats.js";
import { PLATFORMS } from "./platforms.js";
import { readStdin, sessionCheck, type HookInput } from "./session.js";

const HELP = `hybrid-dispatcher — tiered model dispatch across agent systems

  npx hybrid-dispatcher install [--only <platform>] [--dry-run]
  npx hybrid-dispatcher uninstall [--only <platform>]
  npx hybrid-dispatcher init [--yes] [--platform <key>]   set this project's dispatch strategy
  npx hybrid-dispatcher doctor [--model <name>]           check install, config, compaction
  npx hybrid-dispatcher stats [--last N] [--json]         token accounting from dispatch history
  npx hybrid-dispatcher log '<json>'                      append one run record (used by the skill)
  npx hybrid-dispatcher session-check [--compaction]      SessionStart hook: warn only when something is off
  npx hybrid-dispatcher config                            show this project's settings and where each came from
  npx hybrid-dispatcher config <key>=<value> ...          change settings, validated (budget_mode=quality tiers.mid=sonnet)

Platforms: ${PLATFORMS.map((p) => p.key).join(", ")}`;

async function ask(rl: ReturnType<typeof createInterface>, q: string, dflt: string): Promise<string> {
  const a = (await rl.question(`${q} [${dflt}] `)).trim();
  return a || dflt;
}

async function cmdInit(opts: { yes?: boolean; platform?: string }): Promise<number> {
  const existing = readConfig();
  if (existing && !opts.yes) {
    console.log("this project already has .agent-dispatch.json:");
    console.log(JSON.stringify(existing, null, 2));
    console.log("\nre-run with --yes to overwrite, or edit the file directly.");
    return 0;
  }

  const detected = opts.platform ?? detectPlatforms().present[0]?.key ?? "claude";
  const defaults: DispatchConfig = {
    platform: detected,
    tiers: { top: "inherit", mid: "opus", low: "sonnet" },
    budget_mode: "balanced",
    top_tier_subagents: true,
    confirmed: new Date().toISOString().slice(0, 10),
  };

  if (opts.yes) {
    const p = writeConfig(defaults);
    console.log(`wrote ${p} with defaults`);
    return 0;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`Setting the dispatch strategy for this project (platform: ${detected}).`);
    console.log("Tier models must come from this platform's own catalog. Enter to accept defaults.\n");
    const top = await ask(rl, "top tier   (judgment, design, verification)", "inherit");
    const mid = await ask(rl, "mid tier   (implementation from a clear spec)", "opus");
    const low = await ask(rl, "low tier   (search, reading, running tests)", "sonnet");
    const mode = await ask(rl, `budget mode (${BUDGET_MODES.join(" | ")})`, "balanced");
    const topSub = await ask(rl, "may sub-agents use the top tier? (y/n)", "y");

    const cfg: DispatchConfig = {
      platform: detected,
      tiers: { top, mid, low },
      budget_mode: (BUDGET_MODES.includes(mode as BudgetMode) ? mode : "balanced") as BudgetMode,
      top_tier_subagents: !topSub.toLowerCase().startsWith("n"),
      confirmed: new Date().toISOString().slice(0, 10),
    };
    const errs = validate(cfg);
    if (errs.length) { errs.forEach((e) => console.error(`✗ ${e}`)); return 1; }

    const p = writeConfig(cfg);
    console.log(`\nwrote ${p}`);
    console.log("run `npx hybrid-dispatcher doctor` anytime to re-check it.");
    console.log("compaction threshold is per-platform — doctor reports whether yours triggers too late.");
    return 0;
  } finally {
    rl.close();
  }
}

function cmdInstall(only: string | undefined, dryRun: boolean, uninstall: boolean): number {
  const { present, absent } = detectPlatforms(only);
  if (!present.length) {
    console.error(only ? `platform "${only}" not found on this machine` : "no supported agent systems found");
    return 1;
  }
  for (const p of present) {
    const r = uninstall ? uninstallFrom(p, { dryRun }) : installTo(p, { dryRun });
    const verb = uninstall ? "removed" : "installed";
    console.log(`${dryRun ? "[dry-run] " : ""}${p.label}: ${verb} ${r.skillDir}${r.gateWritten ? ` · gate ${uninstall ? "stripped from" : "written to"} ${p.gateFile}` : ""}`);
  }
  for (const p of absent) console.log(`· ${p.label}: not present (${p.configDir})`);
  if (!uninstall) {
    console.log("\nnext: run `npx hybrid-dispatcher init` inside a project to set its dispatch strategy.");
    if (present.some((p) => !p.gateFile))
      console.log("note: Claude Code has no global gate file — add the gate to a project CLAUDE.md for deterministic triggering.");
  }
  return 0;
}

function cmdStats(last: number | undefined, asJson: boolean): number {
  const { runs, malformed } = loadRuns();
  if (!runs.length) {
    console.error("no dispatch history in this project yet (.dispatch-log.jsonl)");
    return 1;
  }
  const scope = last ? `last ${Math.min(last, runs.length)}` : "all history";
  const slice = last ? runs.slice(-last) : runs;
  const s = summarize(slice);
  console.log(asJson ? JSON.stringify(s, null, 2) : renderSummary(s, slice, malformed, scope));
  return 0;
}

function cmdLog(raw: string | undefined): number {
  if (!raw) { console.error("usage: hybrid-dispatcher log '<json run record>'"); return 1; }
  let rec: RunRecord;
  try {
    rec = JSON.parse(raw) as RunRecord;
  } catch (e) {
    console.error(`invalid JSON: ${(e as Error).message}`);
    return 1;
  }
  if (!rec.ts) rec.ts = new Date().toISOString();
  if (!Array.isArray(rec.agents)) rec.agents = [];
  console.log(`appended run to ${appendRun(rec)}`);
  return 0;
}

const SETTABLE = ["budget_mode", "top_tier_subagents", "collapse_ack", "tiers.top", "tiers.mid", "tiers.low"] as const;

function cmdConfig(assignments: string[]): number {
  const cfg = readConfig();
  if (!cfg) {
    console.error("no .agent-dispatch.json here — run `hybrid-dispatcher init` first");
    return 1;
  }

  if (!assignments.length) {
    // Show current state with provenance — a value is only trustworthy if you know
    // whether the env var or the file is supplying it right now.
    const budget = effectiveBudget(cfg);
    console.log(`platform            ${cfg.platform}`);
    for (const tier of ["top", "mid", "low"] as const) {
      const v = cfg.tiers[tier];
      console.log(`tiers.${tier.padEnd(4)}          ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
    console.log(`budget_mode         ${budget.mode}${budget.source === "env" ? "   (overridden by HYBRID_DISPATCH_BUDGET this session; file says " + cfg.budget_mode + ")" : ""}`);
    console.log(`top_tier_subagents  ${cfg.top_tier_subagents ?? true}`);
    console.log(`collapse_ack        ${cfg.collapse_ack ?? false}`);
    if (budget.warning) console.log(`⚠ ${budget.warning}`);
    console.log(`\nchange with: hybrid-dispatcher config <key>=<value>   keys: ${SETTABLE.join(", ")}`);
    return 0;
  }

  const next = structuredClone(cfg);
  for (const a of assignments) {
    const eq = a.indexOf("=");
    if (eq < 1) { console.error(`not key=value: "${a}"`); return 1; }
    const key = a.slice(0, eq), raw = a.slice(eq + 1);
    if (!(SETTABLE as readonly string[]).includes(key)) {
      console.error(`unknown key "${key}" — settable: ${SETTABLE.join(", ")}`);
      return 1;
    }
    const value: unknown = raw === "true" ? true : raw === "false" ? false : raw;
    if (key.startsWith("tiers.")) {
      if (typeof value !== "string" || !value) { console.error(`${key} needs a model name`); return 1; }
      next.tiers[key.slice(6) as "top" | "mid" | "low"] = value;
    } else {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }

  const errs = validate(next);
  if (errs.length) { errs.forEach((e) => console.error(`✗ ${e}`)); console.error("nothing written."); return 1; }

  const p = writeConfig(next);
  console.log(`wrote ${p}`);
  // Immediately show what the change means, not just that it happened.
  for (const w of tierWarnings(next)) console.log(`⚠ ${w}`);
  const budget = effectiveBudget(next);
  if (budget.source === "env")
    console.log(`note: HYBRID_DISPATCH_BUDGET=${budget.mode} still overrides budget_mode in this shell`);
  return 0;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { console.log(HELP); return 0; }

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      only: { type: "string" },
      platform: { type: "string" },
      model: { type: "string" },
      last: { type: "string" },
      json: { type: "boolean" },
      "dry-run": { type: "boolean" },
      yes: { type: "boolean", short: "y" },
      compaction: { type: "boolean" },
    },
  });

  switch (cmd) {
    case "install":
      return cmdInstall(values.only, values["dry-run"] ?? false, false);
    case "uninstall":
      return cmdInstall(values.only, values["dry-run"] ?? false, true);
    case "init":
      return cmdInit({ yes: values.yes, platform: values.platform });
    case "doctor": {
      const { findings, exitCode } = runDoctor(values.model);
      for (const f of findings) {
        if (f.level === "info" && !f.text.includes(":")) console.log(`\n${f.text}:`);
        else console.log(`  ${icon(f.level)} ${f.text}`);
      }
      return exitCode;
    }
    case "stats":
      return cmdStats(values.last ? Number(values.last) : undefined, values.json ?? false);
    case "log":
      return cmdLog(positionals[0]);
    case "config":
      return cmdConfig(positionals);
    case "session-check": {
      // Hook contract: never fail the session. Any trouble here exits 0 silently.
      let input: HookInput = {};
      try {
        const raw = (await readStdin()).trim();
        if (raw) input = JSON.parse(raw) as HookInput;
      } catch {
        return 0;
      }
      try {
        const out = sessionCheck(input, { compaction: values.compaction ?? false });
        if (out.length) console.log(out.join("\n"));
      } catch {
        /* a broken check must not be louder than no check */
      }
      return 0;
    }
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      return 1;
  }
}

main().then((c) => process.exit(c), (e: Error) => { console.error(e.message); process.exit(1); });

/**
 * Usage accounting over dispatch history.
 *
 * The headline number is the estimated saving against running every sub-agent at
 * top tier — that ratio is what tells a user whether tiering is actually paying
 * off on their work. It uses relative tier weights, so it holds regardless of
 * what any vendor charges.
 */
import type { RunRecord } from "./log.js";

export const TIER_WEIGHT: Record<string, number> = { low: 1, mid: 3, top: 10 };
const ORDER = ["top", "mid", "low"];

export interface Summary {
  runs: number;
  agents: number;
  tokens: number;
  seconds: number;
  byTier: Record<string, number>;
  escalations: number;
  agentsMissingTokens: number;
  estimatedSavingVsAllTop: number;
}

export function summarize(runs: RunRecord[]): Summary {
  const byTier: Record<string, number> = {};
  let agents = 0, tokens = 0, seconds = 0, escalations = 0, agentsMissingTokens = 0;

  for (const r of runs) {
    escalations += r.escalations ?? 0;
    for (const a of r.agents ?? []) {
      agents++;
      if (typeof a.tokens === "number") {
        const tier = a.tier ?? "?";
        byTier[tier] = (byTier[tier] ?? 0) + a.tokens;
        tokens += a.tokens;
      } else {
        agentsMissingTokens++;
      }
      if (typeof a.seconds === "number") seconds += a.seconds;
    }
  }

  const weighted = Object.entries(byTier).reduce((s, [t, v]) => s + v * (TIER_WEIGHT[t] ?? 1), 0);
  const allTop = tokens * TIER_WEIGHT["top"]!;
  return {
    runs: runs.length,
    agents,
    tokens,
    seconds: Math.round(seconds * 10) / 10,
    byTier,
    escalations,
    agentsMissingTokens,
    estimatedSavingVsAllTop: allTop ? Math.round((1 - weighted / allTop) * 1000) / 1000 : 0,
  };
}

export function fmtTokens(n: number | null | undefined): string {
  if (typeof n !== "number") return "n/a";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function renderSummary(s: Summary, runs: RunRecord[], malformed: number, scope: string): string {
  const L: string[] = [];
  L.push(`hybrid-dispatcher usage · ${scope} · ${s.runs} run(s)`);
  L.push(`  ${s.agents} sub-agents · ${fmtTokens(s.tokens)} tokens · ${Math.round(s.seconds)}s of agent time`);
  if (s.escalations)
    L.push(`  ${s.escalations} escalation(s) — a subtask came back untrusted and was re-run a tier up`);
  if (s.agentsMissingTokens)
    L.push(`  ${s.agentsMissingTokens} agent(s) reported no token count (platform didn't expose it)`);
  if (malformed) L.push(`  ${malformed} unparseable log line(s) skipped`);

  const total = Object.values(s.byTier).reduce((a, b) => a + b, 0) || 1;
  L.push("", "  by tier:");
  const keys = [...ORDER.filter((k) => k in s.byTier), ...Object.keys(s.byTier).filter((k) => !ORDER.includes(k))];
  for (const t of keys) {
    const v = s.byTier[t]!;
    const bar = "█".repeat(Math.max(1, Math.round((24 * v) / total)));
    L.push(`    ${t.padEnd(4)} ${fmtTokens(v).padStart(8)}  ${((100 * v) / total).toFixed(1).padStart(4)}%  ${bar}`);
  }

  L.push("", "  recent runs:");
  for (const r of runs.slice(-10)) {
    const t = r.totals ?? {};
    L.push(
      `    ${(r.ts ?? "?").slice(0, 16)}  ${fmtTokens(t.tokens).padStart(8)}  ` +
        `${t.agents ?? "?"} agents  ${(r.budget_mode ?? "?").padEnd(8)} ${(r.task ?? "").slice(0, 44)}`,
    );
  }

  L.push(
    "",
    `  estimated ~${(100 * s.estimatedSavingVsAllTop).toFixed(0)}% cheaper than running every sub-agent at top tier`,
    "  (weighted low=1x mid=3x top=10x; a ratio, so it holds regardless of vendor prices)",
  );
  return L.join("\n");
}

/**
 * Dispatch history: one JSON object per line in .dispatch-log.jsonl.
 *
 * Append-only by design — several agent sessions can run against one project at
 * once, and an appending write is the only thing that survives that without a
 * lock. A truncated final line (killed mid-write) is tolerated by the reader.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOG_FILE } from "./config.js";

export interface AgentRecord {
  id?: string;
  task?: string;
  tier?: string;
  model?: string;
  /** null when the platform doesn't report usage — never guess a number. */
  tokens?: number | null;
  seconds?: number | null;
  outcome?: string;
}

export interface RunRecord {
  ts: string;
  task?: string;
  platform?: string;
  session_model?: string;
  budget_mode?: string;
  agents: AgentRecord[];
  totals?: { agents?: number; tokens?: number; seconds?: number; by_tier?: Record<string, number> };
  escalations?: number;
}

export function logPath(cwd = process.cwd()): string {
  return join(cwd, LOG_FILE);
}

export function appendRun(run: RunRecord, cwd = process.cwd()): string {
  const p = logPath(cwd);
  appendFileSync(p, JSON.stringify(run) + "\n");
  return p;
}

export interface LoadResult {
  runs: RunRecord[];
  /** Lines that failed to parse — surfaced rather than silently dropped. */
  malformed: number;
}

export function loadRuns(cwd = process.cwd()): LoadResult {
  const p = logPath(cwd);
  if (!existsSync(p)) return { runs: [], malformed: 0 };
  const runs: RunRecord[] = [];
  let malformed = 0;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      runs.push(JSON.parse(s) as RunRecord);
    } catch {
      malformed++;
    }
  }
  return { runs, malformed };
}

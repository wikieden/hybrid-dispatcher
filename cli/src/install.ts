/**
 * Install = put the skill folder where the platform looks for skills, plus write a
 * delimited gate block into its standing-instruction file.
 *
 * The gate matters more than it looks: description-based skill triggering measured
 * near-zero on gating tasks in non-interactive runs, so the deterministic "read this
 * before spawning anything" instruction is what actually makes the skill fire.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, type Platform } from "./platforms.js";

export const SKILL_NAME = "hybrid-dispatcher";
const BEGIN = "<!-- HYBRID_DISPATCHER_BEGIN -->";
const END = "<!-- HYBRID_DISPATCHER_END -->";
// Blocks written by earlier versions; stripped so re-running never leaves duplicates.
const LEGACY = [["<!-- TIERED_MODEL_DISPATCH_BEGIN -->", "<!-- TIERED_MODEL_DISPATCH_END -->"]];

/** Bundled skill source: `skill/` inside the published package, or the repo checkout. */
export function skillSource(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const c of [
    join(here, "..", "skill"),
    join(here, "..", "..", ".claude", "skills", SKILL_NAME),
  ]) {
    if (existsSync(join(c, "SKILL.md"))) return c;
  }
  throw new Error("bundled skill files not found — reinstall the package");
}

function stripBlocks(text: string): string {
  const out: string[] = [];
  let skip = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === BEGIN || LEGACY.some(([b]) => t === b)) { skip = true; continue; }
    if (t === END || LEGACY.some(([, e]) => t === e)) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}$/, "\n");
}

function gateBlock(p: Platform, skillDir: string): string {
  return `
${BEGIN}
## Hybrid dispatcher (sub-agent gate)

Before spawning any sub-agent / delegating any subtask, read and follow:
\`${join(skillDir, "SKILL.md")}\`

Core rules: planning and synthesis stay in the main session (the user-selected model);
each sub-agent runs at the cheapest capable tier (top/mid/low) per the skill's rubric
and the project's \`.agent-dispatch.json\` (run \`npx hybrid-dispatcher init\` to create
it). Tier models MUST come from ${p.modelCatalogHint} — never another vendor's model
names. Spawn mechanics: \`${join(skillDir, "references")}\`.
${END}
`;
}

export interface InstallResult {
  platform: Platform;
  skillDir: string;
  gateWritten: boolean;
}

export function installTo(p: Platform, opts: { dryRun?: boolean } = {}): InstallResult {
  const skillDir = join(p.skillsDir, SKILL_NAME);
  if (!opts.dryRun) {
    mkdirSync(skillDir, { recursive: true });
    cpSync(skillSource(), skillDir, { recursive: true });
  }
  let gateWritten = false;
  if (p.gateFile) {
    if (!opts.dryRun) {
      const existing = existsSync(p.gateFile) ? readFileSync(p.gateFile, "utf8") : "";
      mkdirSync(dirname(p.gateFile), { recursive: true });
      writeFileSync(p.gateFile, stripBlocks(existing) + gateBlock(p, skillDir));
    }
    gateWritten = true;
  }
  return { platform: p, skillDir, gateWritten };
}

export function uninstallFrom(p: Platform, opts: { dryRun?: boolean } = {}): InstallResult {
  const skillDir = join(p.skillsDir, SKILL_NAME);
  if (!opts.dryRun && existsSync(skillDir)) rmSync(skillDir, { recursive: true, force: true });
  let gateWritten = false;
  if (p.gateFile && existsSync(p.gateFile)) {
    if (!opts.dryRun) writeFileSync(p.gateFile, stripBlocks(readFileSync(p.gateFile, "utf8")));
    gateWritten = true;
  }
  return { platform: p, skillDir, gateWritten };
}

export function detectPlatforms(only?: string): { present: Platform[]; absent: Platform[] } {
  const pool = only ? PLATFORMS.filter((p) => p.key === only) : PLATFORMS;
  return {
    present: pool.filter((p) => existsSync(p.configDir)),
    absent: pool.filter((p) => !existsSync(p.configDir)),
  };
}

export function isInstalled(p: Platform): boolean {
  return existsSync(join(p.skillsDir, SKILL_NAME, "SKILL.md"));
}

export function hasGate(p: Platform): boolean {
  if (!p.gateFile || !existsSync(p.gateFile)) return false;
  return readFileSync(p.gateFile, "utf8").includes(BEGIN);
}

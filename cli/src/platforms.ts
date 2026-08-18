/**
 * Platform registry — the one place that knows where each agent system keeps its
 * files, per OS. Everything else in the CLI works off these descriptors.
 *
 * The cross-OS part is not incidental: Claude Code and Codex use dotfolders under
 * the home directory on every OS, while opencode follows XDG on Linux/macOS and
 * %APPDATA% on Windows. Encoding that here keeps the rest of the code OS-agnostic.
 */
import { homedir } from "node:os";
import { join } from "node:path";

export type PlatformKey = "claude" | "codex" | "gemini" | "opencode";

export interface Platform {
  key: PlatformKey;
  label: string;
  /** Existence of this directory is how we detect the system is installed. */
  configDir: string;
  /** Where a skill folder goes. */
  skillsDir: string;
  /**
   * Standing-instruction file that gets the gate block. Null means the platform
   * has no global mechanism — Claude Code discovers skills by description and
   * gets its deterministic gate per-project via CLAUDE.md instead.
   */
  gateFile: string | null;
  /** Told to the user (and written into the gate) so tiers never borrow another vendor's model names. */
  modelCatalogHint: string;
  /** How this platform configures auto-compaction; surfaced by `doctor`. */
  compaction: { file: string; key: string; unit: "tokens" | "fraction" | "none" };
}

const home = homedir();
const isWindows = process.platform === "win32";

/** XDG on Linux/macOS, %APPDATA% on Windows — opencode follows the platform convention. */
function configHome(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return xdg;
  if (isWindows) return process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
  return join(home, ".config");
}

export const PLATFORMS: Platform[] = [
  {
    key: "claude",
    label: "Claude Code",
    configDir: join(home, ".claude"),
    skillsDir: join(home, ".claude", "skills"),
    gateFile: null,
    modelCatalogHint: "Claude Code's own catalog (fable / opus / sonnet / haiku)",
    compaction: { file: join(home, ".claude", "settings.json"), key: "autoCompactWindow", unit: "tokens" },
  },
  {
    key: "codex",
    label: "Codex",
    configDir: join(home, ".codex"),
    skillsDir: join(home, ".codex", "skills"),
    gateFile: join(home, ".codex", "AGENTS.md"),
    modelCatalogHint:
      "this Codex install's own supported OpenAI model catalog (codex exec --help / config.toml)",
    compaction: { file: join(home, ".codex", "config.toml"), key: "model_auto_compact_token_limit", unit: "tokens" },
  },
  {
    key: "gemini",
    label: "Gemini CLI",
    configDir: join(home, ".gemini"),
    skillsDir: join(home, ".gemini", "skills"),
    gateFile: join(home, ".gemini", "GEMINI.md"),
    modelCatalogHint: "the Gemini CLI's own supported model catalog",
    compaction: {
      file: join(home, ".gemini", "settings.json"),
      key: "chatCompression.contextPercentageThreshold",
      unit: "fraction",
    },
  },
  {
    key: "opencode",
    label: "opencode",
    configDir: join(configHome(), "opencode"),
    skillsDir: join(configHome(), "opencode", "skills"),
    gateFile: join(configHome(), "opencode", "AGENTS.md"),
    modelCatalogHint: "the models configured in this opencode install (opencode.json providers)",
    compaction: { file: join(configHome(), "opencode", "opencode.json"), key: "compaction.auto", unit: "none" },
  },
];

export function platformByKey(key: string): Platform | undefined {
  return PLATFORMS.find((p) => p.key === key);
}

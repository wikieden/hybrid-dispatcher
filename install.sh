#!/usr/bin/env bash
# hybrid-dispatcher installer
#
# One-liner (no clone needed):
#   curl -fsSL https://raw.githubusercontent.com/wikieden/hybrid-dispatcher/main/install.sh | bash
#
# From a checkout:
#   ./install.sh                 install/update on every agent system found on this machine
#   ./install.sh --only codex    install/update on one platform (claude|codex|gemini|opencode)
#   ./install.sh --dry-run       show what would happen, change nothing
#   ./install.sh --uninstall     remove skill copies and gate blocks everywhere
#
# (Flags work with the one-liner too: curl -fsSL <url> | bash -s -- --only codex)
#
# Idempotent: re-running updates the skill files in place and rewrites the gate
# block (old TIERED_MODEL_DISPATCH_* blocks from earlier versions are migrated).

set -euo pipefail

SKILL_NAME="hybrid-dispatcher"
SRC="$(cd "$(dirname "$0")" && pwd)/.claude/skills/$SKILL_NAME"
BEGIN="<!-- HYBRID_DISPATCHER_BEGIN -->"
END="<!-- HYBRID_DISPATCHER_END -->"
OLD_BEGIN="<!-- TIERED_MODEL_DISPATCH_BEGIN -->"
OLD_END="<!-- TIERED_MODEL_DISPATCH_END -->"

DRY=0; UNINSTALL=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --only) ONLY="$2"; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" = 1 ]; then say "  [dry-run] $*"; else "$@"; fi; }

# Standalone mode (curl | bash): no checkout next to the script — fetch the skill
# files from GitHub into a temp dir and install from there.
REPO_RAW="https://raw.githubusercontent.com/wikieden/hybrid-dispatcher/main"
if [ ! -d "$SRC" ] && [ "$UNINSTALL" = 0 ]; then
  say "no local checkout found — fetching $SKILL_NAME from GitHub…"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  mkdir -p "$TMP/references"
  for f in SKILL.md references/claude-code.md references/codex.md \
           references/generic-cli.md references/task-playbooks.md; do
    curl -fsSL "$REPO_RAW/.claude/skills/$SKILL_NAME/$f" -o "$TMP/$f" \
      || { echo "error: download failed for $f (is the repo public?)" >&2; exit 1; }
  done
  SRC="$TMP"
fi
[ -d "$SRC" ] || [ "$UNINSTALL" = 1 ] || { echo "error: skill source not found" >&2; exit 1; }

# strip_block <file> — remove old and new gate blocks (portable, no sed -i quirks)
strip_block() {
  local file="$1" tmp
  [ -f "$file" ] || return 0
  tmp="$(mktemp)"
  awk -v b1="$BEGIN" -v e1="$END" -v b2="$OLD_BEGIN" -v e2="$OLD_END" '
    $0 == b1 || $0 == b2 { skip=1 }
    !skip { print }
    $0 == e1 || $0 == e2 { skip=0 }
  ' "$file" > "$tmp"
  if [ "$DRY" = 1 ]; then say "  [dry-run] strip gate block(s) from $file"; rm -f "$tmp"
  else mv "$tmp" "$file"; fi
}

# append_gate <file> <skill_path> <models_hint>
append_gate() {
  local file="$1" path="$2" models="$3"
  strip_block "$file"
  if [ "$DRY" = 1 ]; then say "  [dry-run] append gate block to $file"; return; fi
  mkdir -p "$(dirname "$file")"
  cat >> "$file" <<EOF

$BEGIN
## Hybrid dispatcher (sub-agent gate)

Before spawning any sub-agent / delegating any subtask, read and follow:
\`$path/SKILL.md\`

Core rules: planning and synthesis stay in the main session (the user-selected model);
each sub-agent runs at the cheapest capable tier (top/mid/low) per the skill's rubric
and the project's \`.agent-dispatch.json\` (run the skill's init to create it,
confirming the tier mapping with the user). Tier models MUST come from $models —
never another vendor's model names. Spawn mechanics: \`$path/references/\`.
$END
EOF
}

copy_skill() {
  local dst="$1"
  run mkdir -p "$dst/references"
  run cp "$SRC/SKILL.md" "$dst/SKILL.md"
  if [ "$DRY" = 1 ]; then say "  [dry-run] cp references/*.md -> $dst/references/"
  else cp "$SRC"/references/*.md "$dst/references/"; fi
}

remove_skill() {
  local dst="$1"
  [ -d "$dst" ] || return 0
  run rm -rf "$dst"
}

installed=(); skipped=()

do_platform() {
  local key="$1" probe="$2" skill_dst="$3" gate_file="$4" models="$5"
  [ -n "$ONLY" ] && [ "$ONLY" != "$key" ] && return 0
  if [ ! -d "$probe" ]; then skipped+=("$key (no $probe)"); return 0; fi
  say "==> $key"
  if [ "$UNINSTALL" = 1 ]; then
    remove_skill "$skill_dst"
    [ -n "$gate_file" ] && strip_block "$gate_file"
    say "  removed $skill_dst${gate_file:+ and gate block in $gate_file}"
  else
    copy_skill "$skill_dst"
    [ -n "$gate_file" ] && append_gate "$gate_file" "$skill_dst" "$models"
    say "  skill -> $skill_dst${gate_file:+ · gate -> $gate_file}"
  fi
  installed+=("$key")
}

#            key       probe dir              skill destination                        gate file                      host model catalog hint
do_platform  claude    "$HOME/.claude"        "$HOME/.claude/skills/$SKILL_NAME"       ""                             ""
do_platform  codex     "$HOME/.codex"         "$HOME/.codex/skills/$SKILL_NAME"        "$HOME/.codex/AGENTS.md"       "this Codex install's own supported OpenAI model catalog (codex exec --help / config.toml)"
do_platform  gemini    "$HOME/.gemini"        "$HOME/.gemini/skills/$SKILL_NAME"       "$HOME/.gemini/GEMINI.md"      "the Gemini CLI's own supported model catalog"
do_platform  opencode  "$HOME/.config/opencode" "$HOME/.config/opencode/skills/$SKILL_NAME" "$HOME/.config/opencode/AGENTS.md" "the models configured in this opencode install (opencode.json providers)"

say ""
if [ "$UNINSTALL" = 1 ]; then say "Uninstalled from: ${installed[*]:-none}"
else say "Installed/updated: ${installed[*]:-none}"; fi
[ ${#skipped[@]} -gt 0 ] && say "Skipped (not present): ${skipped[*]}"
if [ "$UNINSTALL" = 0 ] && [ ${#installed[@]} -gt 0 ]; then
  say ""
  say "Notes:"
  say "  · Claude Code has no global gate file: triggering uses the skill description,"
  say "    plus a per-project CLAUDE.md gate (see this repo's CLAUDE.md for the pattern)."
  say "  · First use in each project runs init: it proposes a tier->model mapping from"
  say "    the host platform's own catalog, confirms with you, writes .agent-dispatch.json."
  say "  · Cursor: paste the gate block into Cursor Settings > Rules (no global file API)."
fi

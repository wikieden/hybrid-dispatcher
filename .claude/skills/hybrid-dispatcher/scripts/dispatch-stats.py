#!/usr/bin/env python3
"""Summarize hybrid-dispatcher run history from .dispatch-log.jsonl.

    python3 dispatch-stats.py [--log PATH] [--last N] [--json]

Reads one JSON object per line (malformed lines are skipped and counted, so a
half-written line from a crashed run never breaks reporting). Prints per-tier
token shares, recent runs, escalation rate, and how much the tiering saved
against a hypothetical all-top-tier dispatch.
"""
import argparse
import json
import sys
from pathlib import Path

# Rough relative price per token by tier — used only for the savings estimate,
# which is a ratio, so absolute vendor prices don't matter.
TIER_WEIGHT = {"low": 1.0, "mid": 3.0, "top": 10.0}
ORDER = ["top", "mid", "low"]


def load(path):
    runs, bad = [], 0
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            runs.append(json.loads(line))
        except json.JSONDecodeError:
            bad += 1
    return runs, bad


def tok(n):
    if n is None:
        return "n/a"
    return f"{n/1000:.1f}k" if n >= 1000 else str(n)


def summarize(runs):
    by_tier, agents, escal, total_tok, total_s = {}, 0, 0, 0, 0.0
    unknown_tokens = 0
    for r in runs:
        escal += r.get("escalations", 0) or 0
        for a in r.get("agents", []):
            agents += 1
            t = a.get("tier", "?")
            n = a.get("tokens")
            if isinstance(n, (int, float)):
                by_tier[t] = by_tier.get(t, 0) + n
                total_tok += n
            else:
                unknown_tokens += 1
            s = a.get("seconds")
            if isinstance(s, (int, float)):
                total_s += s
    # What an all-top-tier dispatch would have cost, in the same weighted units.
    weighted = sum(v * TIER_WEIGHT.get(k, 1.0) for k, v in by_tier.items())
    all_top = sum(by_tier.values()) * TIER_WEIGHT["top"]
    saving = (1 - weighted / all_top) if all_top else 0.0
    return {
        "runs": len(runs),
        "agents": agents,
        "tokens": total_tok,
        "seconds": round(total_s, 1),
        "by_tier": by_tier,
        "escalations": escal,
        "agents_missing_tokens": unknown_tokens,
        "estimated_saving_vs_all_top": round(saving, 3),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", default=".dispatch-log.jsonl")
    ap.add_argument("--last", type=int, metavar="N", help="only the N most recent runs")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    path = Path(args.log)
    if not path.exists():
        print(f"no dispatch log at {path} — nothing dispatched in this project yet", file=sys.stderr)
        return 1

    runs, bad = load(path)
    if args.last:
        runs = runs[-args.last:]
    if not runs:
        print("dispatch log is empty", file=sys.stderr)
        return 1

    s = summarize(runs)
    if args.json:
        print(json.dumps(s, indent=2))
        return 0

    scope = f"last {len(runs)}" if args.last else f"all {len(runs)}"
    print(f"hybrid-dispatcher usage · {scope} runs · {path}")
    print(f"  {s['agents']} sub-agents · {tok(s['tokens'])} tokens · {s['seconds']:.0f}s of agent time")
    if s["escalations"]:
        print(f"  {s['escalations']} escalation(s) — a subtask came back untrusted and was re-run a tier up")
    if s["agents_missing_tokens"]:
        print(f"  {s['agents_missing_tokens']} agent(s) reported no token count (platform didn't expose it)")
    if bad:
        print(f"  {bad} unparseable log line(s) skipped")

    print("\n  by tier:")
    total = sum(s["by_tier"].values()) or 1
    for t in ORDER + [k for k in s["by_tier"] if k not in ORDER]:
        if t not in s["by_tier"]:
            continue
        v = s["by_tier"][t]
        bar = "█" * max(1, round(24 * v / total))
        print(f"    {t:<4} {tok(v):>8}  {100*v/total:4.1f}%  {bar}")

    print("\n  recent runs:")
    for r in runs[-10:]:
        tt = r.get("totals", {})
        print(f"    {r.get('ts','?')[:16]}  {tok(tt.get('tokens'))!s:>8}  "
              f"{tt.get('agents','?')} agents  {r.get('budget_mode','?'):<8} "
              f"{(r.get('task','') or '')[:44]}")

    pct = 100 * s["estimated_saving_vs_all_top"]
    print(f"\n  estimated ~{pct:.0f}% cheaper than running every sub-agent at top tier")
    print("  (weighted low=1x mid=3x top=10x; a ratio, so it holds regardless of vendor prices)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

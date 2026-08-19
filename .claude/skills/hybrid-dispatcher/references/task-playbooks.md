# Task-type playbooks

The four-axis rubric in SKILL.md is the law; these playbooks are presets over it. Different task types don't change *how* tiers are chosen — they change which subtask shapes show up and, critically, **where verification is cheap**. That second thing is what moves tier assignments: wherever a downstream check exists (a test suite, a source document, a compiler), generation can drop a tier.

Identify the task's type (or mix of types), start from its playbook, then adjust with the rubric. A real job is usually a pipeline of types — e.g. "research then build then document" — so playbooks compose in sequence.

## 调研型 — Research / investigation

Shape: wide, shallow, parallel. Many independent sources, one synthesis.

| Stage | Tier | Why |
|---|---|---|
| Source discovery (find the docs/repos/competitors/pages to read) | low | Mechanical search; misses are cheap — the orchestrator sees the list |
| Per-source reading & extraction (one agent per source, structured notes) | low | Verifiable against the source itself; hallucination risk is contained per-source |
| Cross-source fact reconciliation (conflicting claims, version drift) | mid | Requires holding multiple sources honestly; conflicts must be surfaced, not smoothed |
| Synthesis, comparison table, recommendation | **main session** | This is judgment — the whole reason the user picked their model |
| Spot-verification of load-bearing claims (the 2–3 facts the conclusion rests on) | top | A wrong load-bearing fact silently poisons the deliverable |

Rules of thumb: fan out one agent per source, not per question — sources are independent, questions aren't. Give every reader the same structured output schema so synthesis is mechanical to start. Never let a low-tier agent's summary be the only copy of a critical fact: keep source pointers so claims stay checkable. Budget lever: economy trims the source list, not the verification.

## 研发型 — Development / engineering

Shape: narrow, deep, sequential spine with parallel limbs. Design gates everything.

| Stage | Tier | Why |
|---|---|---|
| Architecture / API / error-contract design | **top** (or main session) | Mistakes here silently poison every downstream task |
| Implementation from the written spec (per module, parallel) | mid | This is the code floor: never lower by default. Low only for genuinely mechanical edits (renames, format conversions, boilerplate) that are also test-gated — and say so when you do |
| Test writing (characterization first, then spec tests) | mid | Tests are the plan's verifier — worth more than mechanical effort |
| Running tests / builds / linters, reporting verbatim | low | Execute-and-report; failure is impossible to miss |
| Adversarial diff review vs the spec | **top** | Misses look plausible and get absorbed — the canonical top-tier job |
| Debugging that resisted one attempt | escalate to top | Second failure means the problem is subtler than it looks |

Rules of thumb: never fan out implementation before the design is approved in the main session. Tests gate but don't excuse: a suite catches what it covers, and a weak model's mistakes live precisely in what it doesn't — which is why implementation floors at mid even when test-gated. No tests at all bumps implementation to top. Keep one agent per module boundary so diffs don't collide; use worktree isolation when they must touch shared files.

## 文档型 — Documentation / writing

Shape: outline-gated like 研发型, but verification is asymmetric in the other direction — *accuracy* checks are expensive, *style* checks are cheap.

| Stage | Tier | Why |
|---|---|---|
| Audience/structure/information-architecture decisions | **main session** | Voice and scope are user-taste judgments |
| Extracting facts from code/APIs into a reference skeleton | low | Mechanical, verifiable against the source |
| Per-section drafting from an approved outline (parallel) | mid | Clear spec, but prose quality below mid reads as filler |
| Terminology/link/format consistency sweep | low | Checklist work; a script beats an agent where possible |
| Technical accuracy review (does the doc match the code?) | **top** | Plausible-but-wrong docs are worse than no docs, and nothing else catches this |
| Final voice/coherence pass | **main session** | Stitching parallel sections into one voice is synthesis |

Rules of thumb: the accuracy reviewer must be told to check *against the code*, not against the draft's own claims. Don't parallelize sections that share unfixed terminology — settle the glossary first (cheap, main session) or every section invents its own.

## 审计/评审型 — Audit / review

Shape: parallel finders, expensive judge. (Same pattern as the review workflow in engineering, standalone.)

| Stage | Tier | Why |
|---|---|---|
| Per-area finders (one per module/dimension, structured findings) | low | Read-and-report against explicit criteria; contained blast radius |
| Cross-area/systemic findings (chains individual finders can't see) | **main session** | Requires the whole picture — this is where the orchestrator adds value |
| Verifying findings before reporting (line-by-line against source) | main session or top | A hallucinated finding destroys the report's credibility |
| Dedup/severity ranking | main session | Cheap, judgment-flavored, needs all findings at once |

Rules of thumb: finders overlap slightly at boundaries (file A+B / B+C) so seams get two pairs of eyes. Verify every finding before absorbing it — low-tier finders are accurate at *locating* but sloppy at *characterizing* severity.

## Mixed jobs

Decompose by type first, then apply each playbook to its phase. The phase boundaries are main-session synchronization points: research synthesis gates the design; the design gates implementation; the accuracy review gates publication. Don't let a later phase's agents start from an earlier phase's raw sub-agent output — they start from the main session's synthesized artifact.

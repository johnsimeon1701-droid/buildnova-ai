# BuildNova AI

**From Field Updates to Schedule Intelligence**

An AI-powered planning-to-execution bridge for infrastructure / EPC projects. It converts real-world field updates (free-text reports, site diaries, supervisor notes, uploads) into structured L5/L6 project progress, matches them to the correct schedule activity with a scored **Match Confidence**, and — only after a planner approves — updates the schedule, detects delays and downstream risk, and keeps a complete audit trail.

> **Core principle: AI recommends. Planner approves.** The official baseline schedule is never modified without human sign-off.

Built for **Smart India Hackathon 2026 — Problem Statement SIH2612**.

---

## Features

- **Field Intelligence** — submit free-text / Excel / CSV / TXT reports; deterministic NLU extracts events, identifiers, dates, times, quantities, delays and entities — every value keeps its source evidence.
- **L5/L6 Matching + Match Confidence** — 6 weighted signals (Identifier 30 · Semantic 25 · Keyword 20 · Discipline 10 · Location 10 · WBS 5), scored High ≥90 / Medium 70–89 / Low <70, with duplicate and unknown-tag detection.
- **Planner Approval Gate** — only the Planner can approve / edit / reject; actuals are recorded while the planned baseline is never overwritten.
- **Adaptive one-shot learning** — when a planner corrects a match, the engine learns the association (e.g. "motor skid" → MEC-2001) so a similar future report is steered to the right activity. Learned matches still require planner approval.
- **What-If Delay Simulator** — pick any activity and a slip to trace the downstream cascade (potentially exposed vs. already-in-progress successors). Read-only: it never changes the schedule.
- **AI Progress Brief** — one-click auto-drafted **Daily (DPR)** / **Weekly (WPR)** progress reports compiled from planner-approved updates, with copy + download.
- **Delay & Risk Intelligence**, **Project Memory** Q&A, **Audit Trail**, dashboards with hand-rolled SVG charts (S-curve, discipline mix, risk).

## Run it

Requires **Node.js 18+** (zero runtime dependencies).

```bash
npm start            # or: node server/server.js
# open http://localhost:4730
```

On first boot the app auto-creates the demo data set (`server/data.json`, git-ignored). Use **⚡ LOAD DEMO / RESET DEMO** in the top bar to restore the baseline at any time.

## Demo logins (simulated auth — any password)

Sign in via the **role dropdown** on the login page:

| Role | Email | Can do |
|------|-------|--------|
| Supervisor | supervisor@buildnova.ai | Submit/upload field reports, review extractions & matches. Cannot edit schedule. |
| Planner | planner@buildnova.ai | Review extractions/matches, approve/reject/edit, update schedule, delays/risks, analytics, imports. |
| Project Manager | pm@buildnova.ai | Dashboards, health, delays/risks, memory search, audit (read-only schedule). |

## 3-minute judge flow

1. Click **⚡ LOAD DEMO** (top bar) → PIP-0453 “Erect Line 24-P-102” is *Not Started*.
2. **Field Reports** → the P102 report is pre-filled → **PROCESS WITH AI** (watch the pipeline).
3. Extraction cards show identifier `P102`, actual start `05-Sep-2026 08:45`, qty `4 spools`, delay `Material availability` — each with source evidence.
4. Recommended match **PIP-0453** at **96% confidence** (identifier 30/30 · semantic 25/25 · keyword 18/20 · discipline 10/10 · location 10/10 · WBS 3/5).
5. Log in as **Planner** → **Matching Review** → **APPROVE & UPDATE**.
6. Schedule updates: Actual Start `05-Sep-2026 08:45`, Planned Start stays `01-Sep-2026`, **variance +4 days**, status **Delayed**, successors flagged as *potential downstream risk*.
7. Explore the **What-If Delay Simulator** and the one-click **AI Progress Brief**, then Dashboard KPIs, Project Memory (“Why was P102 delayed?”) and the Audit Trail.

## Architecture

```
Field Reports (free text / Excel / CSV / TXT)
        ↓  Agent 1: Normalization + Extraction (deterministic NLU: IDs, tags, dates, times, quantities, delays, synonyms)
        ↓  Agent 2: L5/L6 Matching — 6 weighted signals  +  adaptive learning from planner corrections
        ↓  Confidence Layer (High ≥90 · Medium 70–89 · Low <70) + duplicate & unknown-tag detection
        ↓  🛡 Human Planner Approval (AI recommends. Planner approves.)
        ↓  Agent 3: Schedule Update (actuals only — baseline never overwritten)
        ↓  Agent 4: Delay & Risk Engine (variance, downstream cascade, what-if simulation)
   Analytics/Dashboard · Agent 5: Project Memory · AI Progress Brief (DPR/WPR) · 📜 Audit Trail
```

## Project layout

```
server/engine.js   Deterministic extraction, hybrid matching, risk/delay, what-if, briefs, analytics, memory, CSV
server/seed.js     104 L5/L6 activities · 31 varied field reports · audit + memory history (fictional data)
server/server.js   Zero-dependency HTTP REST API + static hosting + JSON persistence + RBAC
public/            Vanilla JS SPA: login (role dropdown), sidebar shell, 10 pages, hand-rolled SVG charts
test/              Smoke, render audit (3 roles × 10 pages), navigation, E2E, RBAC, confidence, full audit, new-features
render.yaml        Render.com blueprint (free, one-click deploy)
DEPLOY.md          Deploy guide (Render / Koyeb / Railway)
```

## Tests

`npm test` is fully self-contained: it boots the app server if needed and runs the whole battery
(static bundle sanity → smoke → render audit (3 roles × 10 pages) → nav click → nav anchor → RBAC →
interactive approve E2E → confidence → new features → full audit → live spot-check), restoring the
demo baseline between suites.

```bash
npm install          # dev-only: jsdom
npm test             # one command, boots server if needed, runs all suites
node test/smoke.js   # ...or run an individual suite
```

All data is synthetic and fictional — no real confidential project information.

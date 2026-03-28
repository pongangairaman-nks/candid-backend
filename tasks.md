# Candid — Architecture Review & LLM Cost-Reduction Plan
This document lists **observed architectural flaws** (frontend and backend), then a **phased, granular implementation plan** to **reduce LLM spend** while **preserving resume generation and optimization quality**.
Quality here means: faithful LaTeX structure, accurate tailoring to the job, no invented experience, and actionable ATS feedback. Cost reduction must not silently degrade the **generator** path for full-document tailoring unless guarded by validation or user opt-in.
---
## Part A — Architectural flaws
### A.1 Backend
| Issue | Why it matters | Evidence / notes |
|--------|----------------|------------------|
| **Single “analyzer” model for all analyzer tasks** | JD analysis, ATS requirement extraction, and ATS **mapping** currently share the user’s analyzer config. Mapping benefits from a stronger model; extraction is fine with a small model. Using one expensive model for everything multiplies cost. | `atsLLMService.js`: `extractRequirementsLLM` and `mapRequirementsToResumeLLM` both use `userConfig.model` when set. |
| **Section optimize uses the generator (premium) model + full resume context** | Every section edit can cost as much as a small generation. Comments explicitly prefer “full resume context for best ATS quality.” | `routes/resume.js` `/optimize` uses `getUserLLMConfig(userId, 'generator')` and passes `fullLatex` into Claude/OpenAI/Gemini optimizers. |
| **No “skip analyze” when inputs are unchanged** | Re-running `POST /api/analyze` on the same JD + same master text burns tokens every time. | `routes/analyze.js` always calls `analyzeJobDescription` then updates DB. |
| **LLM ATS baseline is two sequential calls** | Extract + map is correct architecturally, but there is no **batching**, **smaller map context**, or **optional single-call** mode for short JDs. | `routes/atsAnalysis.js` `POST /ats/llm/analysis`. |
| **Duplicate analysis pipelines** | Legacy ATS path can trigger a **fresh LLM JD analysis** if `analysisJson` is missing (`atsAnalysis.js`), while `/api/analyze` also produces analysis. Two codepaths + possible duplicate spend. | `routes/atsAnalysis.js` vs `routes/analyze.js`. |
| **Per-job vs per-user resume row confusion** | `generate.js` and `analyze.js` use “first resume for user” (`ORDER BY id ASC LIMIT 1`). Job-specific state may be stored on `jobApplications` while generation still reads the global master row — easy to misuse and **re-analyze** unnecessarily when switching jobs. | `routes/generate.js`, `routes/analyze.js` queries. |
| **API keys in DB (plaintext)** | Security risk; key rotation and compliance harder. | `llmConfigs` stores API keys (encryption mentioned in docs but verify production). |
| **Unauthenticated PDF compile** | `POST /api/compile-latex` is abuse-prone (CPU, temp files), not LLM cost, but is an operational risk. | Architecture notes / `pdf.js` pattern. |
| **Schema / query consistency** | Some routes mix naming styles in SQL; risk of bugs, wrong columns, or full-table scans after “fixes.” | Audit all `pool.query` against `database.js` definitions. |
### A.2 Frontend
| Issue | Why it matters | Notes |
|--------|----------------|--------|
| **JWT in `localStorage`** | XSS can steal tokens; industry preference is HttpOnly cookies for session. | `api.ts` interceptor. |
| **No client-side request deduplication** | Double clicks or React Strict Mode can duplicate **analyze** / **generate** calls. | Add `AbortController` + in-flight map or disable buttons. |
| **Limited visibility of cost** | Users may run **legacy ATS + LLM ATS + analyze + generate** in one session without understanding cumulative cost. | UX: estimated “steps” or link to usage. |
| **Stale Zustand / cache vs server** | Doc describes config cache; if client shows old master resume while server updated, user may **re-run** generation thinking nothing happened. | Invalidate on tab focus or after save. |
| **`compile-latex` via raw `fetch`** | Bypasses Axios interceptors; inconsistent error handling and harder to centralize auth if you add it later. | `api.ts` pattern. |
### A.3 Documentation vs code drift
- `ARCHITECTURE.md` references files (e.g. `SelectiveOptimizationModal.tsx`, `useToast.ts`) that may not exist or differ — increases onboarding mistakes and wrong optimizations.
---
## Part B — Principles for lowering cost *without* hurting quality
1. **Protect the generator path for full-document tailoring**  
   Use the **best** model only for: (a) full resume generation / major rewrites, (b) optional “quality check” pass. Do **not** swap the generator to a tiny model without A/B validation or user toggle.
2. **Tier models by task** (server-enforced defaults + optional overrides)  
   - **Cheap**: JD keyword extraction, ATS requirement extraction, incremental rescore, section micro-edits.  
   - **Strong**: Full LaTeX tailoring, mapping requirements to long resumes (if heuristic quality drops on cheap).
3. **Shrink context intelligently**  
   - Trim `masterContent` to **JD-relevant** bullets (embedding retrieval or keyword overlap) before the generator call.  
   - For section optimize: send **section + local outline** (headings) + short JD summary, not full LaTeX every time — optional “high quality” button sends full doc.
4. **Cache and idempotency**  
   - Hash `(userId, normalizedJobDescription, masterResumeTextVersion)` → skip analyze if unchanged.  
   - LLM ATS baseline: already partially cached (`ats_analysis.llm` + `force` flag); extend to **resume text + JD** hash invalidation.
5. **One ATS default in UI**  
   Default to **legacy** (no LLM) or **LLM** — not both on every action. Offer the other as explicit.
6. **Measure**  
   Log tokens per route (provider usage exists for ATS; extend to `analyze`, `generate`, `optimize`).
---
## Part C — Granular implementation plan
Work in order; each phase builds on the previous. Estimates are indicative.
### Phase 0 — Instrumentation & guardrails (1–2 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 0.1 | Add **structured logging** for every LLM call: `route`, `phase`, `provider`, `model`, `inputChars` (approx), `durationMs`, optional `tokenUsage` when API returns it. | Logs queryable; can aggregate cost per user/day. |
| 0.2 | Extend usage aggregation beyond ATS (reuse patterns from `atsLLMService` / `GET /ats/llm/usage` or new `/api/llm/usage-summary`). | Dashboard or DB table with per-endpoint counts. |
| 0.3 | Add **feature flags** env vars: e.g. `LLM_ANALYZER_TIER=cheap|user`, `LLM_ATS_MAP_TIER=strong|cheap`, `OPTIMIZE_USE_CHEAP_MODEL=true`. | Ops can tune without redeploying logic-heavy code. |
| 0.4 | Frontend: **disable** Analyze/Generate buttons while request in flight; store `AbortController` to cancel stale requests. | No duplicate parallel analyze/generate for same action. |
**Quality:** No change to models yet — baseline metrics only.
---
### Phase 1 — Split model tiers in the backend (2–4 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 1.1 | Introduce **`getTieredAnalyzerConfig(userId, task)`** in `llmConfig` (or new helper): tasks `jd_analysis`, `ats_extract`, `ats_map`, `section_optimize`, `rescore`. | Each task resolves to provider + model + key. |
| 1.2 | **ATS mapping**: use **strong default** (`mapDefaults` in `atsLLMService.js`) for `mapRequirementsToResumeLLM` *unless* `LLM_ATS_MAP_TIER=cheap` or user explicitly chooses “fast ATS” in settings. | Mapping quality preserved by default. |
| 1.3 | **ATS extract**: always prefer **cheap** defaults (`cheapDefaults`) for `extractRequirementsLLM`, independent of user’s UI-selected analyzer model (or make it a separate dropdown: “JD analysis model” vs “ATS extract model”). | Large $ reduction on ATS baseline. |
| 1.4 | **`/api/analyze`**: use cheap tier for **keyword/structure extraction** if product accepts; keep **one** “deep analysis” optional button that uses the user’s premium analyzer. | User-facing clarity: “Quick analyze” vs “Deep analyze.” |
**Quality:** Default mapping stays strong; extract moves to cheap; analyze may need product copy so users know what degraded (if any).
---
### Phase 2 — Idempotent analyze & smarter invalidation (1–2 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 2.1 | Before LLM in `POST /api/analyze`, compute `contentHash = sha256(normalize(jd) + normalize(masterResumeText))`. | — |
| 2.2 | If DB stores `lastAnalyzeHash` (new column) or compare to hash in `analysisJson` metadata, **return cached analysis** with `cached: true`. | Repeated clicks = $0. |
| 2.3 | Invalidate hash when user updates master template text in configuration. | Stale cache impossible. |
**Quality:** Identical inputs → identical analysis; no LLM drift on repeat.
---
### Phase 3 — Trim context for `POST /api/generate-resume` (3–5 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 3.1 | Add **optional** `masterContentRetrieval`: given `analysisJson` keywords + JD, select top-K chunks from `masterContent` (keyword scoring v1; embeddings v2). | Generator prompt receives shorter, more relevant context. |
| 3.2 | Pass **structured** analysis JSON only (not raw JD again if redundant) to reduce duplicate tokens. | Fewer input tokens; same signal. |
| 3.3 | Optional **two-step generate**: (1) cheap model proposes bullet edits as JSON; (2) strong model applies to LaTeX. **Only enable** after evaluation — flag-gated. | Risk mitigation for quality. |
**Quality:** Phase 3.1–3.2 are low risk; 3.3 needs golden-set testing.
---
### Phase 4 — Cheaper section optimization path (2–3 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 4.1 | New behavior: `POST /api/resume/optimize` uses **`getTieredAnalyzerConfig(..., 'section_optimize')`** with **cheap** default model. | Section edits cost fraction of current. |
| 4.2 | Replace “always send full `fullLatex`” with: **selected section** + **section-adjacent lines** (e.g. ±N lines) + **compact outline** (extract `\section` titles). Add `quality: 'fast' | 'high'` body param: `high` = current behavior (full doc + generator). | Default fast; power users opt into high. |
| 4.3 | Ensure LaTeX constraints in system prompt remain strict (no structural drift). | Spot-check outputs on 10 resumes. |
**Quality:** Default “fast” may miss global tone; “high” preserves today’s behavior.
---
### Phase 5 — ATS UX & backend defaults (1 day)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 5.1 | Frontend: **Primary** ATS button = one mode (recommend **legacy** for zero LLM cost preview, or LLM if product prefers). Secondary: “Detailed AI ATS.” | Fewer accidental LLM ATS runs. |
| 5.2 | Ensure `atsLLMApi.baseline({ force: false })` is default; `force: true` only on explicit refresh. | Already partially there — audit callers. |
| 5.3 | When legacy ATS runs, **do not** call analyzer LLM if `analysisJson` already exists (`atsAnalysis.js` path — verify and remove redundant calls). | One analysis source of truth. |
---
### Phase 6 — Security & abuse (parallel, 1–2 days)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 6.1 | Rate-limit `POST /api/analyze`, `/generate-resume`, `/ats/llm/analysis` per user/IP. | Mitigates accidental loops and abuse. |
| 6.2 | Authenticate or token-scope `compile-latex` (signed short-lived token from authenticated session). | Harder to abuse PDF path. |
| 6.3 | Plan migration to **HttpOnly** session cookie for auth (bigger change; coordinate with frontend). | Long-term security. |
---
### Phase 7 — Documentation & QA (ongoing)
| Step | Task | Acceptance criteria |
|------|------|---------------------|
| 7.1 | Update `ARCHITECTURE.md` to match files, routes, and **tiered** LLM strategy. | Onboarding accuracy. |
| 7.2 | Golden set: 5–10 real JDs + resumes; compare outputs **before/after** cost changes (BLEU not ideal — use human checklist: LaTeX compiles, no fake employers, keyword coverage). | Regression safety. |
---
## Part D — Success metrics
| Metric | Target |
|--------|--------|
| Avg LLM cost per **completed job application** | Drop 30–50% after Phases 1–2–4 |
| Full tailor quality (human or checklist score) | No statistically significant regression vs baseline |
| P95 latency for section optimize | Lower due to smaller context |
| Duplicate analyze calls | Near zero (Phase 2) |
---
## Part E — Quick reference — where to change code
| Goal | Primary files |
|------|----------------|
| Tiered models | `server/routes/llmConfig.js`, new `server/services/llmTierService.js` (suggested), `server/services/atsLLMService.js`, `server/routes/analyze.js`, `server/routes/resume.js` |
| Analyze caching | `server/routes/analyze.js`, `server/config/database.js` (migration), `resumes` metadata |
| Master content trimming | `server/routes/generate.js`, `server/services/*Service.js` tailoring functions |
| Frontend dedupe / UX | `app/src/services/api.ts`, resume editor / job page components |
| Usage metrics | New route or extend `atsAnalysis.js` usage patterns |
---
## Part F — What *not* to do
- Do not switch the **default generator** to the smallest model without validation.
- Do not remove **human-readable** prompts in favor of ultra-compressed prompts until tested (quality cliff).
- Do not merge legacy + LLM ATS into one automatic mega-pipeline without user consent (cost explosion).
---
*Document version: 1.0 — aligned with codebase review as of implementation date. Update Part E paths if files move.*
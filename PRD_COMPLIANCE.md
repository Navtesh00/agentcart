# AgentCart — PRD ↔ Implementation Compliance Report

**Date:** 2026-09-05 · **Author:** Michael (god/orchestrator)
**Method:** `spec-driven-development` (spec = `D:\AgentCart\PRD.md.md`) + `code-review-and-quality` (five-axis)
+ `investigate-first` (evidence only; **no code was changed**).
**Scope:** `PRD.md.md` vs the `agentcart/` implementation (server, api, mcp-server, merchant catalog, db).
**Verdict:** the implementation is a **substantial, security-conscious evolution that diverges from the PRD
contract on 6 structural points**. Every divergence below is tagged with evidence (`file:line`).

## Status legend

| Tag | Meaning |
|---|---|
| ✅ | Fully compliant with the PRD requirement |
| ⚠️ | Partially compliant — intent kept, contract/shape differs |
| ❌ | Missing or mandated requirement not implemented |
| 🔀 | Intentional-looking divergence (implementation chose a different design) |

---

## 1. Compliance matrix — the 6 core struggles

### 1.1 Database: PostgreSQL + `SELECT … FOR UPDATE` → ❌ SQLite, no locking

| PRD (§2, §4) | Implementation | Evidence |
|---|---|---|
| PostgreSQL is **mandatory** | **SQLite** (`better-sqlite3`, WAL, single `agentcart.db` file) | `server/src/db.js:1,10-12`; root `package.json:19` |
| Budget + inventory atomically locked via `SELECT … FOR UPDATE` inside a transaction | No explicit transactions anywhere. Reserve debit is read → check → write across separate statements (`getReserve` → check → `updateReserve`), `checkout/approve:363-428` | `server/src/index.js:326-334, 351-442` |
| Stock deducted atomically on reserve | **Stock is never deducted.** Only checked (`qty <= stock`) at checkout-create time against static/live catalog | `catalog.js:32`, `merchants.js:202-203`; reserve create does no stock check (`index.js:272-302`) |
| Race conditions structurally impossible | Race-safety relies on Node's single-threaded event loop, **not** on DB row locking. Real TOCTOU window exists if the event loop interleaves (e.g. await between check and write in `checkout/approve` before `createOrder`) | `index.js:407-428` |

> **Honest nuance (investigate-first):** SQLite's WAL single-writer means two code paths can't interleave mid-statement, which is why it "works" in tests. But the PRD's guardrail was row-level locking; the implementation does not meet that contract and the risk profile is different (single-process, in-memory semantics).

### 1.2 Path versioning → ❌ no `/api/v1`

| PRD (§4) | Implementation | Evidence |
|---|---|---|
| "All endpoints **must** be versioned (`/api/v1/...`)" | Every route is unversioned: `/api/catalog`, `/api/reserve/create`, `/api/checkout/create`, `/api/webhook`, `/api/agent/login`, ... | `server/src/index.js:196-603` (entire route table); no `/api/v1` in app code (only Razorpay's own `/api/v1/orders` in `ARCHITECTURE.md:25`) |

### 1.3 Catalog cache: `node-cache` (60s TTL) → ❌ no cache at all

| PRD (§2, §4) | Implementation | Evidence |
|---|---|---|
| In-memory `node-cache`, 60s TTL for external merchant catalog fetches | `node-cache` is **not a dependency**. External catalogs are fetched over raw HTTP on **every** request with an 8s timeout | `merchants.js:153-170` (`fetchExternalCatalog`), `package.json` (no `node-cache`) |
| Prevents upstream rate-limiting + latency | **N+1 amplification:** `calcMerchantTotal` calls `getMerchantProduct` **per cart item**, each of which re-fetches the *entire* external catalog — a 10-item cart = 10 full upstream fetches | `merchants.js:196-208` → `merchants.js:186-194` |
| Clamp `limit` to avoid LLM context explosion | `limit` clamped to `<= 200` per page | `merchants.js:84`, `catalog.js:22` |

### 1.4 Payment rails: Mock Razorpay (buildathon theater) → 🔀 real Razorpay test mode

| PRD (§2, §3, §5) | Implementation | Evidence |
|---|---|---|
| "Razorpay (Mocked for Buildathon)" — mock order id returned at Phase 4 | **Real Razorpay Orders + Webhooks** whenever `rzp_test_*` keys exist; `order_mock_*` only as keyless fallback | `razorpay.js:5-30`, `getMode()` `razorpay.js:22-24` |
| `approval/pin` with a mock token → status **CONFIRMED** | Fully-rolled HITL: capability token + one-time 6-digit human PIN + idempotency keys; statuses `pending_approval`/`approved` (not PRD's `PENDING`/`CONFIRMED`) | `index.js:123-181` (capability/PIN), `index.js:351-442` (approve), `db.js:32-47` (reserve schema) |
| PRD §5 forbids real SMS/email OTP | **Compliant** — the PIN is synthetic and capability-gated, comment marks SMS/email as "in production" (roadmap, not built) | `index.js:149-152` |

> The HITL build over-delivers on the PRD's "theater" and is the strongest part of the code — but it changes the API contract (new endpoints, different statuses, required `approval_token` + `idempotency_key`).

### 1.5 Session-vs-reserve budgeting → 🔀 budget rides on reserves, not sessions

| PRD (§3 Phase 1) | Implementation | Evidence |
|---|---|---|
| `POST /api/v1/sessions { total_budget_cents }` → one hard per-session ceiling for the agent | Agent sessions exist but carry **no budget field** (`sessions` table: id/agent_key/created/expires only). The hard ceiling is a per-`reserve` block (`max_block` / `remaining`) | `db.js:84-89`, `db.js:275-291`; `index.js:272-302` (reserve-born budget) |
| Agent login `POST /api/v1/agents/login` | `/api/agent/login` (HMAC) → bearer token = session id | `index.js:535-543` |

**Trade-off for the human:** per-reserve blocks allow *per-transaction* envelopes (closer to Reserve Pay SBMD semantics); the PRD's per-session `total_budget_cents` gives a lifetime agent ceiling. They are different guardrails — choose one to make canonical.

### 1.6 Machine-readable error codes → ⚠️ mixed envelope, no `BUDGET_EXCEEDED`

| PRD (§4) | Implementation | Evidence |
|---|---|---|
| "All error responses machine-readable, structured JSON with **error codes** like `BUDGET_EXCEEDED`, not vague strings" | **Bilingual**: some structured codes (`rate_limited`, `validation_failed`, `capability_expired`, `merchant_not_found`, `external_catalog_unavailable`, `nonce_reused`, `timestamp_expired`…) but key business guards return **prose strings**: `"Bounded check failed: total X > reserve remaining Y"`, `"reserve not found"`, `"not found"`, `"reserve expired — 90d validity"`, `"invalid approval PIN — human approval not verified"` | `index.js:277, 331, 404`, `index.js:135-141, 158-160, 207, 327-328` |
| Consistent machine-readable shape | 4 coexisting envelopes: `{error}`, `{error, code}`, `{error, details}`, `{error, audit}`; catch-blocks bubble raw `e.message` (potential leak) | `index.js:219, 241, 256, 267, 343, 440, 473, 475` |

**Ready-made plan (already designed, not yet applied):** central code registry `code → {httpStatus, message, retryable}`; single envelope `{ error, message, field, request_id }`; error-hierarchy middleware converting `AppError`/Zod/rate-limit into the envelope; enumerate the business codes (`BUDGET_EXCEEDED`, `RESERVE_EXPIRED`, `RESERVE_NOT_FOUND`, `STOCK_INSUFFICIENT`, `AUTH_REQUIRED`, …).

---

## 2. Full requirement sweep — everything not in the big six

| PRD requirement | Status | Evidence / note |
|---|---|---|
| ✅ *Agent accountability: session ids + HMAC, no forced human OAuth* | ✅ | Per-request HMAC-SHA256 over `METHOD+PATH+TS+NONCE+BODY`, constant-time compare, 60s timestamp tolerance, nonce replay-block + cleanup | `index.js:59-110` |
| ✅ *Identity: phone/email optional & unverified, no checkout block* | ✅ | `user_phone` has a default; `customer` fully optional; no blocking | `validation.js:16-20, 9-14` |
| ⚠️ *Pagination metadata `{count,total,has_more,next_offset,products}`* | ⚠️ | Returns `{count,total,offset,limit,products}` — **no `has_more` / `next_offset`**, no cursor | `index.js:202`, `catalog.js:25`, `merchants.js:86` |
| ✅ *Zod validation* | ✅ | Zod schemas + `validate` middleware on all POST bodies | `validation.js` |
| (PRD silent on) *Reserve cancel / expiry restore / inventory restore* | ❌ | **No cancel endpoint.** `status === "cancelled"` is only defensively checked; nothing ever sets it; no stock restore path (no stock was ever deducted). Funds effectively expire via `expires_at` checks | `index.js:368-369`; `db.js` has no cancel fn |
| ⚠️ *`approval_token` flow* | ⚠️ | Vestigial/inconsistent: `ApproveCheckoutSchema` **requires** a non-empty `approval_token`, but `reserve/create` stores `approval_token: null` and `verifyCapability` never validates it — the real gates are the capability header + PIN | `validation.js:32-36`, `index.js:287, 351-442` |
| ✅ *Trusted-webhook model* | ✅ | HMAC verify + `timingSafeEqual`, raw-body, unknown-event reject, "no matching order" audited | `index.js:480-526` |
| ✅ *Rate limiting* | ✅ | 3 limiters: API 100/15min, write 30/15min, public checkout 10/15min + proof-of-work gate | `index.js:36-37, 448-477` |
| (extra) *Idempotency keys* | ✅ | Payload-cached responses, replay audit | `db.js:49-53, 264-272`; `index.js:355-360, 436` |
| (extra) *MCP server* | ✅ | 5–7 tools over stdio, HMAC-signs every call | `mcp-server/src/index.js` (not in PRD scope) |
| (extra) *Agent dashboard + activities* | ✅ | `/api/agent/login` → bearer → KPIs/feed | `index.js:535-560` |

---

## 3. Anti-scope (§5) — what the PRD forbids, verified as NOT built

| PRD §5 "explicitly NOT building" | Finding |
|---|---|
| ❌ Real SMS/Email OTP (Twilio/SendGrid/Firebase) | ✅ None — synthetic capability-gated PIN only |
| ❌ Distributed caching (Redis/Upstash) | ✅ None — but *nothing* is cached (the promised node-cache also isn't there) |
| ❌ Webhook retry queues (BullMQ/Inngest) | ✅ None |
| ❌ Merchant dashboards | ✅ None for merchants — `web/` is a customer/agent showcase + AI Playground; `/api/agent/dashboard` is agent-facing, not a merchant console |
| ❌ Complex human auth (Google/Apple login) | ✅ None — OAuth-free |

---

## 4. Documentation drift (found during the audit — worth fixing regardless of design choice)

- **README API table is stale vs code:** documents `X-Agent-Key` auth (`README.md:65,81-83`) but the code/`.env.example` use HMAC headers `x-agent-id/x-nonce/x-timestamp/x-signature` (`index.js:59-110`) with `AGENT_SECRETS`, not `AGENT_KEYS`.
- `checkout/create` documented as "→ Razorpay order" (`README.md:83`) but code now only *prepares* the cart; payment happens at `checkout/approve` (`index.js:313-345`).
- README says over-limit → "fallback Payment Link" (`README.md:83,153`) — that path was removed; **`createPaymentLink` is imported but never called (dead code)**, and the fallback described in `ARCHITECTURE.md:66-69` no longer exists.
- README lists audit/reset as open (`README.md:87-89`) — they now require an agent session.
- `server/src/store.js` is a legacy shim (re-exports `db.js`); `reserves/orders/debits/audits` Maps are unused.

---

## 5. Five-axis findings on the diverging areas

- **Correctness:** reserve debit path is not transactional; `approval_token` contract is internally inconsistent (required but null/ignored); public `orders/create` writes DB inside a `.then()` fire-and-forget after responding (`index.js:467-473`) on a `createOrder()` promise — a pending rejection path.
- **Security:** strong HMAC/webhook discipline; residual: raw `e.message` in 500 responses can leak internals (`index.js:343, 440, 473, 475`).
- **Performance:** external-catalog N+1 (see 1.3) is the biggest cost; no cache means no upstream rate-limit protection.
- **Architecture:** monolith `index.js` (666 lines, routes+middleware+llms.txt in one file); `createPaymentLink`/`getRazorpay` dead imports; dual budgeting concepts (session vs reserve) unresolved.
- **Spec-alignment:** contract-level gaps are the 6 struggles above; behavior-wise the core money-guard philosophy (bounded/explainable/gated) is fully honored.

---

## 6. Recommendations (guidance only — no execution in this report)

| # | Priority | Option A — code → PRD | Option B — PRD → code | Neutral |
|---|---|---|---|---|
| 1 | `database` | Migrate to PostgreSQL, wrap reserve/checkout in `BEGIN … FOR UPDATE … COMMIT`, add true stock deduction + cancel/restore | Accept SQLite **only if** you add explicit transactions + row leasing; else commit to PG | Decide the authority question first (see below) |
| 2 | `versioning` | Mount current routes under `/api/v1` + keep `/api/*` aliases during transition | Update PRD to unversioned, then never version | Either way, pick one canonical path set |
| 3 | `caching` | Add `node-cache` 60s TTL keyed by external URL; dedupe `calcMerchantTotal` to one fetch per merchant | Update PRD to drop node-cache, but you *must* fix the N+1 amplification regardless | Fix N+1 is mandatory either way |
| 4 | `payments` | Lock real-Razorpay behind an explicit flag; keep buildathon mock as default | Update PRD to "real test-mode Razorpay + mock fallback" (matches deployed reality) | Document the richer HITL as the live design |
| 5 | `budgeting` | Move budget onto sessions (`total_budget_cents`) | Keep per-reserve blocks; PRD's "session ceiling" becomes a per-reserve envelope | One model must be canonical; pick it, then align |
| 6 | `errors` | Apply the error-code plan from §1.6 (enumerate `BUDGET_EXCEEDED`, etc., central registry + middleware) | — | Apply regardless; it's spec-neutral |
| 7 | `docs` | — | — | Refresh README env/auth/API table; delete `createPaymentLink` dead path; retire `store.js` shim |

**Open decision for the human (blocks #1/#2/#5):** *Is the PRD or the implementation authoritative?* The PRD specifies PostgreSQL + `/api/v1` + node-cache + session budgets + mock rails; the shipped build is SQLite + `/api` + no cache + reserve budgets + real Razorpay test mode. The report has deliberately not presupposed the answer — Options A/B above make either choice executable, step by step, per-gap, each gated by sign-off.
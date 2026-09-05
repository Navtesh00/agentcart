Here is the updated `prd.md` with a dedicated, crystal-clear **System Design & Transaction Flow** section. It uses high-level architectural logic and step-by-step sequences so the AI agent understands *exactly* how the pieces connect, without getting lost in raw code.

---

# `prd.md` — AgentCart North Star & Context Guide

> **⚠️ INSTRUCTIONS FOR THE AI AGENT:** 
> This document defines **WHAT** we are building, **HOW** the system flows, and our strict architectural boundaries. Do not generate implementation code or database schemas unless explicitly asked. Your primary job is to ensure every suggestion or design aligns perfectly with these rules.

---

## 1. The Core Thesis
Razorpay provides excellent payment *rails*, but lacks **agent-aware primitives**. 
**AgentCart** is the missing infrastructure layer for *agentic commerce* (AI agents buying on behalf of users). We provide three things Razorpay doesn't:
1. Machine-readable, paginated catalogs (preventing LLM context overflow).
2. Server-enforced budget guardrails via bounded Reserves.
3. Agent accountability (via HMAC sessions, not forced human OAuth).

---

## 2. System Design & Architecture
The system is a lightweight, stateful API layer sitting between the AI Agent and the Payment Gateway.

**Core Components:**
1. **AI Agent Client**: Holds the `hmac_secret` and `session_id`. Makes all API calls.
2. **AgentCart API (`/api/...`)**: The central orchestrator. Handles auth, validation, caching, and business logic.
3. **PostgreSQL Database**: The source of truth. Stores agents, sessions, catalog metadata, and reservations. *Crucial:* Handles concurrency via row-level locking.
4. **In-Memory Cache (`node-cache`)**: Stores external merchant catalog responses for 60 seconds to prevent rate-limiting and reduce latency.
5. **External Merchant Server**: Holds the actual inventory. AgentCart fetches from here, but does not own the data.
6. **Razorpay (test mode with mock fallback)**: The final payment execution layer.

---

## 3. The Core Transaction Flow (Step-by-Step)
*The AI agent must understand this exact sequence. Deviating from this order breaks the budget guardrails.*

### Phase 1: Onboarding
1. **Agent Login**: Agent sends HMAC signature to `POST /api/agent/login`.
   - *Result*: System returns a bearer session token (24h expiry). Sessions are auth tokens only — they carry no budget ceiling.

### Phase 2: Discovery (Context-Safe)
3. **Catalog Fetch**: Agent calls `GET /api/merchants/:id/catalog?offset=0&limit=10`.
    - *Logic*: API checks `node-cache`. If miss, fetches from External Merchant URL (with optional auth header), caches for 60s, and returns.
    - *Result*: Agent receives max 10 items + `count`/`total`/`offset`/`limit`/`products`. No LLM context overflow.

### Phase 3: Reservation (The Critical Guardrail)
4. **Reserve Request**: Agent calls `POST /api/reserve/create` with `max_block_inr` and `consent`.
    - *Logic*: API creates a Reserve (the budget-blocking primitive). The agent never sees `human_pin`.
    - *Result*: A `PENDING` reserve is created with an `expires_at` (90d) and a one-time human-held PIN stored hashed in DB.
    - **Clarification on `human_pin`**: The `human_pin` is generated at reserve/create time and stored hashed in the DB. It is NEVER returned to the agent in the `reserve/create` response. The agent cannot self-approve because it never has the PIN.

### Phase 4: Approval & Execution (Human-in-the-Loop)

The full HITL sequence is **10 steps**. The agent stops and waits between step 3 and step 8:

1. **Agent** → `POST /api/reserve/create` → gets `reserve_id` (agent never sees `human_pin`).
2. **Agent** → `POST /api/checkout/create { items, reserve_id }` → prepares cart, stores items in reserve. **NO Razorpay order yet.**
3. **Agent** → `POST /api/approval/request-token { reserve_id }` → gets a short-lived capability token.
4. **Agent** sends the checkout URL to the human. **Agent STOPS AND WAITS.**
5. **Human** opens the URL in browser.
6. **Browser** → `POST /api/approval/pin` (`x-capability` header) → human sees the one-time PIN.
7. **Human** enters the PIN in the UI and clicks Approve.
8. **Browser** → `POST /api/checkout/approve { reserve_id, approval_token, idempotency_key }` → **Razorpay order is created HERE.**
9. **Human** pays via Checkout.js.
10. **Razorpay** fires webhook (`payment.captured`) → order status = `paid`.

---

## 4. Strict Architectural Boundaries (The Rules)
*Any deviation from these rules is a failure of context.*

- **Identity**: Sessions (`POST /api/agent/login`) are auth tokens only (24h expiry, no budget ceiling). Budget blocking lives on Reserves (`POST /api/reserve/create` with `max_block_inr`). Phone/email are optional and unverified.
- **Database**: PostgreSQL is mandatory. Use `SELECT ... FOR UPDATE` inside transactions for budget deduction or inventory reservation to prevent TOCTOU race conditions.
- **API Design**: All current routes use `/api/...` with **no version prefix**. `/api/v1/` is a **planned migration** — do not rename existing routes until explicitly told to. Use `/api/` for now. All error responses must be machine-readable (structured JSON with error codes like `BUDGET_EXCEEDED`, not vague strings).
- **Caching**: Use `node-cache` (in-memory, 60s TTL) for external merchant catalog fetches. 
- **Catalog Responses**: Must always include pagination metadata: `{ count, total, offset, limit, products }`.
- **Human PIN**: The `human_pin` is generated at `reserve/create` time and stored hashed in the DB. It is NEVER returned to the agent in the `reserve/create` response. The agent cannot self-approve because it never has the PIN.

---

## 5. What We Are Explicitly NOT Building (The Anti-Scope)
*Do not suggest, design, or write code for these. They are out of scope for this build.*

- ❌ **Real SMS/Email OTP**: No Twilio, SendGrid, or Firebase Auth. The "human approval" is a mock/theater endpoint.
- ❌ **Distributed Caching**: No Redis or Upstash. We use `node-cache` only.
- ❌ **Webhook Retry Queues**: No BullMQ or Inngest. 
- ❌ **Merchant Dashboards**: Merchants use Razorpay's native dashboard. We do not build a UI for them.
- ❌ **Complex Human Auth**: No Gmail/Apple login flows for agents.

---

## 6. The "Honest Roadmap" (README Only)
We acknowledge production gaps to show architectural maturity, but we **document them, we do not build them**. If asked about production readiness, the agent must state that the following are planned for V2 using paid tools:
- Out-of-band PIN delivery (Twilio/MSG91).
- Distributed caching (Upstash Redis).
- Webhook delivery guarantees (BullMQ + Redis).
- Strict phone/email verification at checkout.

### Planned tasks (not yet built)
- `POST /api/reserve/:id/cancel` — cancel a reserve and restore stock (not yet built).
- `/api/v1/` route versioning — planned migration; existing `/api/...` routes stay as-is until instructed.

---

### 🎯 Agent Directive Summary
When working on this project, always ask yourself: 
1. *"Does this protect the agent's budget atomically?"* 
2. *"Does this prevent LLM context overflow via pagination?"* 
3. *"Am I accidentally building a paid production feature instead of the agreed mock/in-memory equivalent?"* 

If the answer to #3 is yes, stop and revert to the Buildathon scope.

---

### How would you like to proceed?
Now that the PRD is updated and accurate, I can:
1. Generate the **PostgreSQL schema and seed script** to get the database ready.
2. Write the **`POST /api/reserve/create`** endpoint (the reservation primitive, featuring `max_block_inr`, `human_pin`, and consent).
3. Draft the **`/api/v1/` versioning migration plan**.
4. Draft the **`llms.txt`** file so other AI agents know exactly how to talk to our API.

Which one should we tackle first?
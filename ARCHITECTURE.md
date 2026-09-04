# AgentCart — Architecture

AgentCart is a Razorpay-powered **agentic commerce** system: an AI agent browses a live catalog, holds a
bounded Reserve Pay block, and checks out through real Razorpay Orders — every money action explainable,
bounded, and gated. A `web/` showcase lets humans run the exact same tools an LLM calls.

## System flow diagram

```
                          ┌─────────────────────────────────────────────────────────────┐
                          │                   AgentCart (the product)                   │
                          │                                                             │
 ┌────────────┐   MCP   ┌─▼──────────────┐   HTTP/JSON   ┌─────────────────────────────┐ │
 │  AI agent  │◄═══════►│  agentcart-mcp │◄══════════════►│       Express API          │ │
 │ (Claude /  │  stdio  │   (5 tools)    │   /api/*      │  server/·api/ :3001        │ │
 │ Cursor /   │         │   list_catalog │               │  catalog · reserves ·      │ │
 │ ChatGPT)   │         │   get_product  │               │  checkout · webhook ·      │ │
 │            │         │create_agent_   │               │  orders · audit            │ │
 │            │         │  checkout      │               │                            │ │
 │            │         │ create_reserve │               │    │                      │ │
 │            │         │get_reserve_    │               │    │ Razorpay SDK         │ │
 │            │         │  status        │               │    ▼                      │ │
 └────────────┘         └────────────────┘               │ ┌────────────────────────┐ │ │
                                                         │ │      Razorpay          │ │ │
 ┌────────────┐  fetch /api (Vite proxy)                 │ │  Orders /api/v1/orders │ │ │
 │  Web UI    │◄════════════════════════════════════════►│ │  Payment Links          │ │ │
 │ Vite :5173 │       /api/catalog /checkout /orders      │ │  Webhooks               │ │ │
 │ (landing,  │                                          │ └────────────┬───────────┘ │ │
 │  AI play-  │                                          │              │ callback     │ │
 │  ground,   │                                          │              ▼              │ │
 │  Recent    │                                          │  POST /api/webhook        │ │
 │  Orders)   │                                          │  (HMAC verify, flip status)│ │
 └────────────┘                                          │                            │ │
                                                         └────────────┬───────────────┘ │
                                                                      ▼                 │
                                                          In-memory store (server/src/store.js)
                                                          reserves · orders · debits · audits
                                                     (shared by server & api via workspace)
                          └─────────────────────────────────────────────────────────────────┘
```

## Happy-path flow

```
1. Agent/User  GET  /api/catalog                    → 10 products, price_inr + stock (bounded, readable)
2. Agent/User  POST /api/reserve/create {max_block_inr:10000, consent:true}
                 → funds blocked → reserve {id, remaining, expires_at +90d, consent_txn_id}
3. Agent/User  POST /api/checkout/create {items:[{id,qty}], reserve_id}
                 → calcTotal() → bounded check: total ≤ remaining, qty ≤ stock, not expired
                 → Razorpay Orders.create (amount paise, receipt) → order id
                 → debit reserve (remaining −= total) → audit "checkout_create"
                 → returns order + checkout_url (Razorpay Checkout.js)
4. Shopper      pays in Checkout (Test Mode: success@razorpay / 4111 1111 1111 1111)
5. Razorpay     POST /api/webhook (event payment.captured)
                 → verify x-razorpay-signature (HMAC-SHA256, RAZORPAY_WEBHOOK_SECRET)
                 → order.status = "paid", record payment_id, release reserve debit
                 → audit "webhook_payment_captured"
6. UI / Agent   GET /api/orders → Recent Orders shows status flipped to Paid (auto-refresh 5s)
```

## Failure path (bounded — never lets an agent overspend)

```
Checkout total > reserve.remaining  (or expired / over-stock)
  → POST /api/checkout/create returns 400
  → audit "checkout_blocked_exceeds_reserve" { bounded_check, consent:false }
  → graceful fallback: Razorpay Standard Payment Link (short_url) issued
  → explainability: "Graceful fallback to Standard Payment Link (not Reserve debit)"
```

## Status model (webhooks → order lifecycle)

| Webhook event | Order status | Notes |
|---|---|---|
| `payment.authorized` | `authorized` | bank auth complete, capture pending |
| `payment.captured` | `paid` | reserve debit released, `payment_id` stored |
| `payment.failed` | `failed` | `failure_reason` logged |
| (none yet) | `created` / `pending` | shown neutral in Recent Orders UI |

## Bounded / explainable / gated invariants

| Invariant | Enforcement |
|---|---|
| Max block | `RESERVE_MAX_BLOCK=10000` INR, checked paise at reserve create |
| Per-debit bound | `total ≤ reserve.remaining` else 400 + fallback link |
| Stock bound | `qty ≤ stock` (catalog) |
| Expiry | reserve `expires_at` 90d, checked at checkout |
| Consent | `consent` required at reserve create; `consent_txn_id` stored |
| Agent auth | `AGENT_KEYS` + `X-Agent-Key` gate `POST /api/reserve/*`, `/api/checkout/*` (server only) |
| Explainability | each order carries `why`, `bounded_check`, `consent`, `amount_inr` + audit entry |
| Tamper-proof | amount fixed by Razorpay `order_id` — server computes total, order can't be changed |

## Components

- **`server/`** — Express API + in-memory store + catalog. `server/src/index.js` (182L) is the standalone
  dev server (`:3001`); `api/index.js` is the shared app it imports. In-memory state: `reserves`, `orders`,
  `debits`, `audits` (`server/src/store.js`). Tests: `npm --workspace server run test`.
- **`mcp-server/`** — `@modelcontextprotocol/sdk` stdio server exposing the 5 agent tools
  (`mcp-server/src/index.js`); calls the API via `AGENTCART_API` (default `http://localhost:3001`).
- **`web/`** — Vite + React showcase (`web/src/main.jsx`). Vite proxy forwards `/api` (`:*` and
  `/llms.txt`) to `:3001` (`web/vite.config.js`). Sections: hero, how-it-helps bento, live merchant proof,
  **AI Playground**, **Recent Orders** (live status, 5s auto-refresh), Razorpay rails, pricing, docs.
- **`research/`** — official Razorpay research + `client-data/hotelpranjal.json` (live merchant catalog)
  + `eval/` 50-batch data.

## Modes

- **Mock** (no keys): `createOrder/createPaymentLink` return `order_mock_*` / `plink_mock_*`; full audit,
  no Razorpay account. `GET /health` → `mock:true`.
- **Live test mode** (`rzp_test_*`): real `order_*` via Razorpay Orders, real Payment Links, HMAC webhook
  verify. Same bounded logic, no code change.

## Deploy / run

```bash
npm install
npm run dev:server   # :3001
npm run dev:web      # :5173 (proxies /api)
npm run dev:mcp      # MCP stdio
```

Env: see `README.md` (§ Environment variables) — `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`PORT`, `WEB_URL`, `RESERVE_MAX_BLOCK`, `RESERVE_VALID_DAYS`, `AGENT_KEYS`.

Deeper research + eval: `docs/architecture.md`, `docs/how-agent-works.md`, `docs/eval/results.csv`.

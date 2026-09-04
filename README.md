# AgentCart — Razorpay Buildathon · Track 01 (AI Growth & Agentic Commerce)

**Make any Razorpay merchant AI-buyable in-chat — bounded, explainable, gated money. ~5 min setup.**

AgentCart is a working storefront where an AI agent (Claude, Cursor, ChatGPT, or any LLM via MCP) can
browse a **live catalog**, hold a **bounded UPI Reserve Pay block**, and **checkout through real Razorpay
Orders** — all audited. Shoppers never leave the chat to pay, and every Rupee has a reason.

It solves the two things that kill conversational commerce:

- **70% checkout abandonment** — discovery happens in a chat but payment requires leaving it.
- **Invisible to AI buyers** — merchants aren't discoverable by LLM agents.

AgentCart bridges that gap with an agent-readable catalog + conversational checkout against **official
Razorpay rails** (Reserve Pay SBMD, Orders API, Payment Links, Webhooks, MCP 1.0).

---

## Product showcase

The repo ships a full marketing + demo site (`web/`) so you can see (and try) the story end-to-end:

- **Hero + trust** — bounded Reserve Pay, live metrics, Hotel Pranjal (Pure Veg) as a real live merchant.
- **Live merchant proof** — a 10-item live catalog (stock-checked), read-only excerpt.
- **AI Playground** — type natural language ("Get me vegetarian dinner for two under 700") or drive the
  same MCP tools by hand. Create a Reserve, add dishes, check out bounded, and watch it block when you go
  over the limit (graceful Payment-Link fallback, audit intact).
- **Recent Orders** — live payment status for the last 5 orders (pending / authorized / paid / failed),
  auto-refreshing every 5s after a checkout.
- **Razorpay Rails, Pricing, Docs** — the bounded/explainable/gated model explained, with audit details
  kept behind `/docs` so the landing stays product, not demo.

---

## Quick start (no keys — mock mode auto)

```bash
npm install
npm run dev:server   # backend  -> http://localhost:3001
npm run dev:web      # frontend -> http://localhost:5173 (proxies /api to :3001)
npm run dev:mcp      # MCP stdio server for AI agents
npm --workspace server run test   # validates the full flow
```

Open <http://localhost:5173>.

**With keys** (real Razorpay Orders / Payment Links / Webhooks), copy `.env.example` to `.env` and fill in
your `rzp_test_*` test keys. **Without keys** the server runs in mock mode (`order_mock_*`) — fully
verifiable audit, no Razorpay account needed.

---

## Environment variables (`server/.env` or repo-root `.env`)

| Variable | Purpose | Default |
|---|---|---|
| `RAZORPAY_KEY_ID` | Test key from dashboard → Settings → API Keys → Test (`rzp_test_*`) | *(mock mode if empty)* |
| `RAZORPAY_KEY_SECRET` | Test secret for Orders / Payment Links | *(mock mode if empty)* |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC-SHA256 `x-razorpay-signature` verify for `/api/webhook` | `whsec_xxx` |
| `PORT` | Backend listen port | `3001` |
| `WEB_URL` | Frontend origin for webhook/docs | `http://localhost:5173` |
| `MCP_PORT` | MCP server port | `3002` |
| `RESERVE_MAX_BLOCK` | Max Reserve Pay block (INR) | `10000` |
| `RESERVE_VALID_DAYS` | Reserve validity (days) | `90` |
| `AGENT_KEYS` | Comma-separated agent keys; gates `POST /api/checkout/*` + `/api/reserve/*` via `X-Agent-Key` | `agent_demo_key_123,another_key` |

`AGENT_KEYS` is enforced in the **server** workspace (`server/src/index.js:17-25`); public endpoints
(catalog, orders, health, `llms.txt`) stay open. Use a strong random value in production.

---

## API endpoints

All money amounts are in **paise** server-side; UI/doc display them as INR. Public unless noted.

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/health`, `/api/health` | open | liveness + mode (`mock` vs live), `reserve_max_paise` |
| `GET` | `/api/catalog?q=&price_min=&price_max=&category=&limit=&offset=` | open | paginated product listing (`count/total/products`) |
| `GET` | `/api/catalog/:id` | open | single product (`p1`..`p10`) |
| `POST` | `/api/reserve/create` | `X-Agent-Key` | block funds `{max_block_inr, consent:true}` → `reserve` + `remaining` + `expires_at` |
| `GET` | `/api/reserve/:id` | open | reserve status / remaining |
| `POST` | `/api/checkout/create` | `X-Agent-Key` | `{items:[{id,qty}], reserve_id?}` → Razorpay order; bounded by stock + reserve remaining; fallback Payment Link if over-limit |
| `POST` | `/api/webhook` (+ alias `/api/webhook/razorpay`) | webhook sig | `payment.captured`→paid, `payment.failed`→failed, `payment.authorized`→authorized (HMAC verified) |
| `GET` | `/api/orders` | open | all orders |
| `GET` | `/api/orders/:id` | open | one order (status, payment_id, items, reserve_id) |
| `GET` | `/api/audit` | open | last 50 audit entries |
| `GET` | `/api/reserves`, `/api/debits` | open | reserve blocks + debits |
| `POST` | `/api/test/reset` | open | reset in-memory store |
| `GET` | `/llms.txt` (+ `/llm.txt`, `/.well-known/llms.txt`) | open | agent-readable catalog + API reference |

---

## MCP tools (for AI agents)

`agentcart-mcp` exposes 5 tools over stdio (`npm run dev:mcp`), pointed at the backend via
`AGENTCART_API` (default `http://localhost:3001`):

- `list_catalog` — search catalog by query / price bound / category
- `get_product` — single product by id
- `create_agent_checkout` — bounded, explainable checkout `{items, reserve_id?}`
- `create_reserve` — Reserve Pay block `{max_block_inr, user_phone}`
- `get_reserve_status` — remaining / expiry / audit for a reserve

Razorpay's own remote MCP (`https://mcp.razorpay.com/mcp`, 40+ tools) can be layered on.

---

## Test credentials (Razorpay Test Mode)

- **UPI ID**: `success@razorpay` (succeeds) / `failure@razorpay` (fails)
- **Cards**: `4111 1111 1111 1111` (Visa) · `5105 1051 0510 5100` (Mastercard) · `3782 822463 10005` (Amex)
- **Test phone**: `9999999999`
- **Default rate-limit note**: test mode caps Standard Payment Links at 30/business; the batch path uses Orders.

---

## Demo flow (2 minutes)

1. Open <http://localhost:5173> → **AI Playground**.
2. **Create Reserve Rs 10,000 (90d)** → funds blocked, `consent_txn_id` + `expires_at` shown.
3. Type *"Get me vegetarian dinner for two under 700"* (or click a prompt chip) → AI picks items into the cart.
4. **Checkout** → Razorpay Checkout opens (log in with `success@razorpay` in Test Mode).
5. Back on the site: **Recent Orders** shows the order flip to **Paid** within ~5s (webhook → status).
6. Try **over-limit** (e.g. `p2 × 15`) → the bounded check blocks it and issues a graceful fallback
   Payment Link, audit trail preserved.
7. Inspect the money trail under **Docs** → audit, orders, reserves, debits.

---

## Repo layout

```
server/     Express API + in-memory store + catalog + Razorpay orders/links/webhooks + tests
mcp-server/ MCP stdio server (5 agent tools) → server API
web/        Vite + React showcase (product landing, AI playground, live merchant, recent orders, rails, docs)
api/        Shared Express app (used by server), exports for Vercel serverless
docs/       architecture.md, how-agent-works.md, product-showcase-ia.md, eval/ (results.csv, summary.json, 50-batch)
research/   official Razorpay research + client data (hotelpranjal.json) + eval batch data
```

**Architecture + flow diagram** → see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Track 01 bar — how AgentCart meets it

| Bar | AgentCart |
|---|---|
| **Explainable** | every money action logs `why`, `bounded_check`, `consent`, `amount_inr` + audit entry |
| **Bounded** | Reserve max `Rs 10,000` / 90d, per-debit `total ≤ remaining`, stock `qty ≤ stock` |
| **Gated** | `consent` at reserve create; reserve_id required for Reserve debit; `X-Agent-Key` on agent endpoints |
| **Failure handled** | over-limit → blocked JSON + fallback Payment-Link `short_url`, audit preserved |
| **Measured** | 50-order batch: **34 ok / 16 blocked → 16 fallback**, 51 audits (`docs/eval/`) — not cherry-picked |

## Apply

Repo + 5-min video + architecture → <https://forms.gle/d9r2gvxp8cmoZhon9>

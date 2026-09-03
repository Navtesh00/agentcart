# AgentCart Product Showcase — IA + Copy Deck (product-showcase-01)
_Sellable product site, not dev demo. Any AI can discover and pay via Razorpay API. Owner: Jim (jim-mtkz1oeb) — IA/copy only, no code. Unblocks product-showcase-02._

## 1. Goal & Story
**Goal:** Transform `web/src/main.jsx:1` dev demo (catalog grid + audit + Reserve controls) into a **product landing** where a merchant/shopper/AI understands value in 15s and an AI can actually `list_catalog → checkout` bounded via Razorpay.

**Current:** Single-page dev demo exposes internals (audit table, raw Reserve IDs, `POST /api/*` controls) as primary UI. Judges see mechanics, not product.

**Target:** Marketing hero → social proof (live Hotel Pranjal) → 3-persona bento → AI playground (real bounded flow) → Razorpay rails → pricing/docs → footer. Dev internals moved behind `/docs` (not navbar). Agent layer (`/api/catalog`, `/llms.txt`, `mcp-server/src/index.js:1`) stays first-class but invisible to humans.

**Design constraint:** Keep tokens from `web/src/main.jsx:84-154` — `Fraunces 300/400/600 + Instrument Sans 400/500/600`, `--ink #0c1226 / --ink-2 #131b33 / --forest #0e3a2d`, single accent `--clay #5B6CF0` 55% saturation, hairline `--brass #7a8cc0`, WCAG AA (bone `#eef2ff` on ink 12:1). Already passes buildathon bar.

## 2. Sitemap & Routing (Vercel `vercel.json:1`)
| Route | Purpose | Public | Notes |
|---|---|---|---|
| `/` | Product showcase landing | yes | React SPA `web/src/main.jsx:1` — sections below. No hash-only dev audit. |
| `/llms.txt` | Agent-readable catalog | yes | `api/index.js:117` + `server/src/index.js:116` — `listCatalog():10` lines, stays linked in footer + hero sub. |
| `/api/catalog` `?q=&price_max=&category=` | Agent+web catalog | yes | `catalog.js:15` filtered search. |
| `/api/catalog/:id`, `/api/reserve/create`, `/api/checkout/create`, `/api/webhook/razorpay` | Rails | yes/no | Rails unchanged (`api/index.js:20-108`); docs only. |
| `/docs` | Dev/audit deep-dive | **via footer only, not header** | Houses audit table, raw order/reserve JSON, `docs/architecture.md:1`, `docs/eval/results.csv`. Prevents demo-looking audit grid on landing. |
| `/api/health` | Probe | yes | For playground liveness. |

Header nav becomes: `How it helps` `AI Playground` `Razorpay Rails` `Pricing` `Docs` `GitHub` + `Try live demo →` CTA. Today `site-header:156-162` has `How it helps / Live demo / Audit` — replace `Audit` with `Rails / Pricing / Docs`.

## 3. Page Structure — `web/src/main.jsx` → Product Showcase
**Single scroll landing, 6 sections + footer.** Max container `1120px`, `section-pad` clamp.

### 3.1 Header (sticky, `site-header.scrolled` on >40px)
`AgentCart + RAZORPAY TRACK 01` wordmark left, nav center, `btn-primary` CTA right.

### 3.2 Hero (min-height 92vh, 1.1:0.9 grid, left-aligned — keep existing `hero:114-195`)
*Goal: value prop in 2 lines.*
- **Micro-label (brass):** `UPI Reserve Pay • MCP 1.0 • Razorpay Test Mode` (keep)
- **H1 (Fraunces 300, 4.4rem):** `Every chat / becomes a checkout.` (keep — proven)
- **Sub (stone, 48ch):** `AgentCart makes any Razorpay merchant AI-buyable in-chat — any AI can discover Hotel Pranjal's menu and pay bounded via UPI Reserve Pay, audit-backed.` *(tweak: add “any AI” explicitly)*
- **CTAs:** `[Try AI Playground →]` anchor `#ai-playground` (primary) + `[See how it works]` anchor `#helps` (ghost) + `[View code]` GitHub `github.com/Navtesh00/agentcart` (ghost, keep)
- **Micro-proof (brass):** `LIVE — Hotel Pranjal (Pure Veg) · 10-item catalog · Bounded Reserve Pay 10k/90d · Vercel serverless · success@razorpay in Test Mode`
- **Right hero-card:** Keep “LIVE FLOW — What we built” card (`hero-card:119`) but swap metric labels to product: `Live catalog 10 items / Bounded per-debit check / Every action audited` (remove `34/50` batch jargon — that belongs in `/docs`).

### 3.3 Merchants / Shoppers / AI — bento (`#helps`, 3 cols, keep `bento:126-220`)
Keep 3-card bento, reframe copy from tech to persona benefit:

| Card | `micro-label` | H3 | P (≤32 words) | mono footer |
|---|---|---|---|---|
| For merchants | `For merchants` | Become AI-buyable in 5 minutes | Expose your Razorpay catalog via `GET /api/catalog` + `MCP list_catalog`. Accept in-chat checkout, upsell within limits, capture revenue that was 70% abandonment — no app switch. | `list_catalog → create_agent_checkout → Order → audit` |
| For shoppers (forest bg) | `For shoppers` | Pay inside the chat, not outside | Ask Claude “order paneer for two under 700” → agent debits your Reserve block, shows `remaining + consent`, revocable in UPI app. One PIN, N debits. | `1 block → N bounded debits until 90d` |
| For AI (Razorpay) | `For AI & Razorpay` | Proves Agentic Payments live | Uses official rails: UPI Reserve Pay (Live, 10k/90d/SBMD, `research/knowledge/upi_reserve_pay.json:1`) + 40+ MCP tools + Orders API signature verify (`research/knowledge/orders_api.json:1`). Same as Replit x Razorpay beta. | `research/razorpay-official/02* verified 2026-09-02` |

Below bento: single sentence proof bar — `Hotel Pranjal mirror live at hotelpranjal.in — 10 SKUs from research/client-data/hotelpranjal.json:1`

### 3.4 Live Merchant — Hotel Pranjal proof (`#live-merchant`, NEW - extracts from demo grid)
*Goal: tangible, not synthetic.*
- **Header:** `micro-label brass` `03 — Live merchant proof` + `H2 Fraunces 300` `Hotel Pranjal (Pure Veg) is live. Ten dishes, real checkout.`
- **Proof strip:** 3 chips — `10 items` `Rs 25 – Rs 280` `stock-checked` — pulled from `catalog.js:2-13`
- **Catalog sample (read-only grid, 5 items visible, rest behind “View full menu”):** Reuse `dish:135` card but remove `Add +` (that moves to playground). Shows name/category/stock/₹/desc. Source `catalog.js:2-13` **verbatim, no re-derive**:
  - `p1 Paneer Butter Masala Rs280 paneer 100`
  - `p2 Paneer Tikka Dry Rs260 paneer 80`
  - `p3 Veg Biryani Rs199 rice 120`
  - `p4 Dal Tadka + Jeera Rice Combo Rs180 dal 90`
  - `p5 Pav Bhaji (Amul) Rs120 pavbhaji 150`
  - (below fold) `p6 Veg Thali (Full) Rs220` `p7 Tandoor Roti Rs25` `p8 Masala Fries Rs99` `p9 Veg Crispy Chinese Rs190` `p10 Cold Coffee Mocktail Rs80` — all `veg:true`
- **CTA:** `[Test it in AI Playground ↓]`

### 3.5 AI Playground (`#ai-playground`, 320px + 1fr `demo-grid:131-279` — keep layout but rebrand)
*Goal: “any AI can come and do work” — bounded flow any agent can call, with human preview.*
- **Header:** `micro-label brass` `04 — AI playground · bounded, live, any AI` + `H2` `Tell an AI: “Go to Hotel Pranjal and order something.”`
- **Sub:** `Type natural language or call the same tools an LLM does: GET /api/catalog → POST /api/reserve/create → POST /api/checkout/create. Every amount is gated by remaining + stock + expiry. Try under/over-limit and see audit.`
- **Left panel:** Keep AI input + `Ask AI to order →` button (`aiInput:55`, `askAI:59-81`). Add 3 prompt chips that fill input: `Vegetarian dinner for two under 700` | `Paneer for 3 under 800` | `Cheapest combo under 400`. AI trace box stays (`rgba(91,108,240,.08)`). Below trace: `Tool trace: list_catalog {query,price_max} → create_agent_checkout {items,reserve_id} → bounded check → Orders API (mock→ rzp_test) → audit`.
- **Right panel:** Bounded checkout (the only cart on the page). Keep `Create Reserve Rs 10,000 (90d SBMD)` + `Reserve pill:68` + filter + `catalog-grid` (now 2-col filtered) + `cart-line:140` + `Checkout via Reserve debit` + `Try over-limit → block + fallback link:51` + metric row (`Orders / Audits / Reserve left`) — but **hide raw audits `pre` behind /docs** (show only 1-line summary: `Last audit: checkout_create #abc · bounded_check: total ≤ remaining`). Full 6-audit `audit-pre` moves to `/docs`.
- **Helper mono:** `MCP stdio: mcp-server/src/index.js:1 — list_catalog / get_product / create_agent_checkout / create_reserve / get_reserve_status at AGENTCART_API=http://localhost:3001` + `Remote: https://mcp.razorpay.com/mcp` (unchanged).
- **Empty state copy:** `Try: "Get me vegetarian dinner for two under 700" — AI searches Hotel Pranjal catalog, picks cheapest under budget, fills cart. Click Checkout.`

### 3.6 Razorpay Rails — Trust (`#rails`, replaces `#audit`, `arch-grid:149` 2-col)
*Goal: sell trust, not expose tables.*
- **Header:** `micro-label brass` `05 — Built on Razorpay rails · explainable, bounded, gated` + `H2` `Every rupee has a reason.`
- **Left card:** `Why bounded?` — Max `10,000`/`90d`/multi-debit from `research/knowledge/upi_reserve_pay.json:6`, per-debit `total <= remaining`, stock `qty <= stock` (`catalog.js:28`), consent+gated, explainability `why + bounded_check + consent + amount_inr` (`server/src/index.js:79-85`). Mention `graceful fallback: Payment Link if exceeds` (`server/src/index.js:68-73`).
- **Right card:** `Measured, not mocked` — 50-order batch `34 ok / 16 blocked → 16 fallback, 52 audits` from `docs/architecture.md:45` + `research/knowledge/*`, link to `docs/eval/results.csv` + `research/razorpay-official/02_agentic_payments.md`. Contrast `12:1 / 55% / AA`.
- **Bottom strip (mono):** `/llms.txt · /api/catalog · POST /api/checkout/create {"items":[{id,qty}], "reserve_id"}` — keep `llms.txt:117-124`

### 3.7 Pricing (`#pricing`, NEW bento 3-col)
*Goal: show product, not just demo.*
- **Micro:** `06 — Pricing`
- **H2:** `Start free. Pay when they pay.`
- **3 tiers:**
  - Developer (free): `Mock Orders` `order_mock_*` without keys, full audit, localhost + Vercel — `docs/architecture.md:57` env not needed.
  - Buildathon/Test (`rzp_test`): `RAZORPAY_KEY_ID=rzp_test_xxx` (`razorpay.js:3-9`), `success@razorpay` via `Checkout.js`, real `order_*` id, `x-razorpay-signature` verify (`api/index.js:92-98`), Standard Links in test (`research/knowledge/orders_api.json`).
  - Live (Support-activate): UPI Reserve Pay SBMD via Support (`research/knowledge/upi_reserve_pay.json:8` — “Request Support to activate”), no code change (`architecture.md:63`), `callback_url` → Vercel/Razorpay webhook.
- **CTA under:** `[Read docs → /docs]` + `[Get test keys → dashboard.razorpay.com]`

### 3.8 Footer (keep `footer:152` flex)
Left: `© AgentCart — Razorpay Buildathon Track 01 · Vercel serverless · github.com/Navtesh00/agentcart`
Right: `Fraunces + Instrument Sans · #5B6CF0 · hairline --brass · /llms.txt · /api/catalog · mcp-server/src/index.js` + `Research in research/razorpay-official/* verified 2026-09-02`

## 4. Copy Deck (ready to drop into React)
### 4.1 Voice & Tone
Concise, merchant-first, no jargon outside Razorpay primitives (Reserve Pay SBMD, Orders paise, signature). Verbs: discover, block, debit, audit, revoke. Never show “Failed” — say “Blocked → fallback Payment Link (audited).”

### 4.2 Exact strings (handoff to `02` frontend rebuild)
**Hero H1:** `Every chat` `<br/>` `becomes a checkout.`
**Hero sub:** `AgentCart makes any Razorpay merchant AI-buyable in-chat — bounded UPI Reserve Pay, audit trail, and graceful fallback.`
**Hero card p:** `Discovery happens in ChatGPT/Claude, but pay fails outside. AgentCart bridges it: agent-readable catalog /llms.txt + /api/catalog + MCP tools + UPI Reserve Pay block → N debits within limits.`
**Flow steps:** `1 Block Rs10k` `2 Chat orders` `3 Debit bounded` `4 Audit + settle`
**How it helps — merchant H3:** `Become AI-buyable in 5 minutes` / **shopper:** `Pay inside the chat, not outside` / **Razorpay:** `Proves Agentic Payments live`
**AI playground H2:** `Tell the AI: "Go to Hotel Pranjal and order something"`
**AI placeholder:** `e.g. Get me dinner for two under 700`
**AI empty trace:** `Try: "Get me vegetarian dinner for two under 700" — AI will search Hotel Pranjal catalog, build a bounded cart, and fill the demo cart below for you to Checkout.`
**AI trace formula:** `AI understood: budget Rs{BUDGET}, people {N}{ paneer?} → searched Hotel Pranjal catalog ({N} veg matches) → picked {names = Rs×qty} = Rs{TOTAL} ≤{BUDGET} · via Reserve {id… remaining Rs} · Why: vegetarian, in stock, cheapest under budget. [MCP: list_catalog → create_agent_checkout → bounded check → audit]` (mirrors `main.jsx:77`)
**Reserve button:** `Create Reserve Rs 10,000 (90d SBMD)` / **Reserve pill:** `Reserve {id…} remaining Rs {remaining/100} · expires {date} · consent {6 chars}`
**Cart header:** `Cart — bounded by reserve` / empty: `Empty — add a dish` / filled: `{n} items · Total Rs {total/100}`
**Checkout buttons:** `Checkout via Reserve debit` | `Clear` | `Try over-limit → block + fallback link`
**Checkout msg (bounded ok):** `Paid — Order {local.id} · Razorpay {razorpay_order_id} · Rs {amount/100} · audit {audit.id} · {why}` (`main.jsx:44`)
**Checkout msg (blocked):** `Bounded block: {error} → Fallback Payment Link {short_url} (audit {id}) — This is the graceful failure for video.` (`main.jsx:43`) / over-limit demo: `✓ Bounded block demonstrated: {error} → Fallback {short_url} (audit {id}) — This is the core safety mechanic judges want.` (`main.jsx:51`)
**Rails mono:** `POST /v1/orders amount paise · verify signature · UPI links not in test → Standard Links · 30 links limit` (keep)
**Trust — Why bounded p:** `Reserve max Rs 10,000 / 90d, per-debit remaining check, stock check. Over-limit is blocked with audit + fallback Payment Link — demo this by ordering p2 x15 (Rs 5985) on a 5k reserve.`
**Trust — Measured p:** `50-order batch: 34 ok / 16 blocked → 16 fallback, 52 audits. See results.csv + agentic rails.`
**Pricing tier names:** `Developer` `Buildathon/Test` `Live`

### 4.3 Hotel Pranjal names (from `catalog.js:3-13`, do not re-derive)
`p1 Paneer Butter Masala`, `p2 Paneer Tikka Dry`, `p3 Veg Biryani`, `p4 Dal Tadka + Jeera Rice Combo`, `p5 Pav Bhaji (Amul)`, `p6 Veg Thali (Full)`, `p7 Tandoor Roti (per pc)`, `p8 Masala Fries`, `p9 Veg Crispy Chinese`, `p10 Cold Coffee Mocktail` — all `veg:true`, categories as in file.

## 5. Agent Layer — keep but hide dev tables
**Keep public:** `GET /api/catalog`, `GET /llms.txt`, `GET /health`, `POST /api/reserve/create` (SBMD 1 block → N debits, consent PIN sim, `research/knowledge/upi_reserve_pay.json:4-6`), `POST /api/checkout/create` (calcTotal bounded → `createOrder` `api/index.js:76-77` mock→real switch on `RAZORPAY_KEY_ID`, debit → `audit()`), `POST /api/webhook/razorpay` (HMAC, `api/index.js:92-108`), `mcp-server/src/index.js:19-25` 5 tools.
**Hide behind /docs:** `GET /api/audit` `GET /api/orders` `GET /api/reserves` `GET /api/debits` JSON dumps, raw batch `results.csv`/`summary.json`, detailed `audit-pre:148`. On landing, show only 1-line audit summary.
**Docs content:** `architecture.md:1-63` stays, plus eval batch, plus link to `razorpay.com/docs/payments/recurring-payments/upi-reserve-pay` + `razorpay.com/docs/api/orders` + `razorpay.com/docs/mcp-server/remote` (already in `research/`).

## 6. AI Playground Spec — any AI can come and do work
**Actors:** Human (browser), LLM (Claude/Cursor/ChatGPT App), MCP `mcp-server/src/index.js:1` stdio, Express `api/index.js:1` HTTP, Razorpay API `server/src/razorpay.js:3` (mock or `rzp_test`).

**Flow (human preview mirrors agent):**
1. Discover: `GET /api/catalog?q=veg&price_max=700` or `list_catalog {query:"paneer", price_max:700}` → 10-item filtered Hotel Pranjal.
2. Gate: `POST /api/reserve/create {max_block_inr:10000, user_phone}` → `{reserve:{id,remaining,expires_at,consent_txn_id}}` (`api/index.js:32-47`). Explainability: `Funds blocked Rs 10000, debits allowed until {90d} within limit, revocable in UPI app`.
3. Bounded checkout: `POST /api/checkout/create {items:[{id,qty}], reserve_id, customer:{name,contact,email}}` → `calcTotal` (`catalog.js:24`) → `if total > reserve.remaining → 400 + audit checkout_blocked_exceeds_reserve + fallback short_url` (`api/index.js:68-73`) else `createOrder {amount paise, receipt, notes:{reserve_id}}` → `razorpay_raw.id` → `orders.set` + `reserve.remaining -= total` + `debits.push` + `audit checkout_create` → `{order:{razorpay_order_id, amount, explainability{why,bounded_check,consent}}, checkout_url, audit}` (`api/index.js:76-86`).
4. Pay: `checkout_url https://checkout.razorpay.com/v1/checkout.js?order_id=...` — test with `success@razorpay` → `payment.captured` webhook → verify signature → order `paid` (`api/index.js:92-108`).
5. Audit: every money action → `audits[]` via `audit()` (`server/src/store.js`), visible in audit trace; over-limit always produces `blocked + fallback + audit` (video timestamp).

**Bounded invariants (must not regress, from `architecture.md:24`):** `max_block 10000`, `90d`, `total <= remaining`, `qty <= stock`, consent gated, tamper-proof `order_id`, graceful fallback.

**Playground UI contract:** Human typing natural language triggers local `askAI:59-81` simulation (parse budget/people/paneer/veg, pick cheapest under budget, fill cart) — same logic LLM will execute via MCP. Bound preview shows `via Reserve {…remaining Rs} · Why: vegetarian, in stock, cheapest under budget. [MCP: ...]` — must match real `GET /api/catalog` results.

## 7. Razorpay Rails (handoff to `03` hardening — no code now, but IA locks behavior)
- Orders: `server/src/razorpay.js:10-14` — mock `order_mock_*` when no keys, real `order_*` when `RAZORPAY_KEY_ID/SECRET` env `test` → `api/index.js:76` handles Checkout.js. Keep `amount paise` (`razorpay.com/docs/api/orders`).
- Payment Links fallback: `razorpay.js:15-18` — Standard Links in test (UPI not supported in test, per `research/knowledge/orders_api.json`), 30/batch limit — IA surfaces fallback as product feature, not error.
- Webhook: HMAC SHA256 (`api/index.js:94-97`), not visible on landing.
- Env: `.env.example:1` `RAZORPAY_KEY_ID=rzp_test_xxx`, `RAZORPAY_WEBHOOK_SECRET`, `RESERVE_MAX_BLOCK=10000`, `RESERVE_VALID_DAYS=90` — IA copies these verbatim to `/docs` env block, landing only says “Add test keys → works without code change”.

## 8. Pricing (UI, not billing logic)
See 3.7. Tiers are narrative; 03 will wire env. No paywall code now.

## 9. What Changes in `02` Frontend Rebuild (not this task)
- Replace `web/src/main.jsx:156-313` dev layout: header nav, hero sub + hero-card metrics, `#helps` keep, add `#live-merchant` (read-only catalog excerpt), rebrand `#ai-chat → #ai-playground`, keep `demo-grid:131` but hide full audit `pre` behind `/docs`, add `#rails` + `#pricing`, add `/docs` route (React Router or hash `#docs`).
- Keep all `fetch('/api/catalog')`/`/audit`/`/orders`/`/reserve/create`/`/checkout/create` calls as-is; only move audit/orders `pre` dumps.
- Keep `vercel.json:1` rewrites; no backend change.

## 10. Definition of Done (for `01`)
- This file exists at `D:\MunderDifflin\agentcart\docs\product-showcase-ia.md` and is reviewed by god.
- Covers hero, 3 personas, live Hotel Pranjal 10-item proof, AI playground bounded spec (any AI), Razorpay rails, pricing, and “hide dev behind /docs” rule.
- Reuses Hotel Pranjal 10 items verbatim (no re-derive), cites `web/src/main.jsx:1`, `catalog.js:1`, `server/src/index.js:1`, `api/index.js:1`, `mcp-server/src/index.js:1`, `research/razorpay-official/*`.
- No code modified; `tasks.json:1.product-showcase-01.status=done` (assignee `jim-mtkz1oeb`) after review, unblocking `02`.

## 11. References & Traceability
- `board.md:111-115` product showcase initiative (dev demo → product, any AI via Razorpay API)
- `tasks.json:1` `01` doing → `02/03` blocked chain
- `web/src/main.jsx:1` dev demo source (hero 166-195, bento 198-220, AI chat 224-239, demo 242-280, audit 282-307, styles 84-154)
- `server/src/catalog.js:1` 10-item catalog single source of truth
- `server/src/index.js:1` + `api/index.js:1` bounded checkout + reserve + /llms.txt + webhook
- `mcp-server/src/index.js:1` MCP 5 tools
- `research/razorpay-official/02_agentic_payments.md:1` UPI Reserve Pay SBMD live, 40+ MCP tools, Replit beta
- `research/knowledge/upi_reserve_pay.json:1` limits 10k/90d, use_for_agentcart sim
- `docs/architecture.md:1` current system diagram + batch 34/16/52

---
*Status: draft for god review → `board.md:125` Next dispatches 02 (frontend rebuild) + 03 (Razorpay hardening) on ack.*

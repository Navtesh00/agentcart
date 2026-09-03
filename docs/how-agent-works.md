# How AgentCart Agent Works

> Any AI can discover Hotel Pranjal (or any Razorpay merchant) and pay bounded via Razorpay API. Product showcase, not dev demo. Stack: `MCP stdio` + `Express API` + `Razorpay Orders/Reserve Pay` + `audit trail`.

## 1. What the agent is

AgentCart is **not a chatbot**. It's a **tool layer** that makes a Razorpay merchant AI-buyable:

* **Human:** types `order paneer for two under 700` in chat
* **LLM:** calls tools `list_catalog` → `create_reserve` → `create_agent_checkout` (bounded)
* **Razorpay:** `POST /v1/orders` `amount paise` → `order_*` + `checkout.js` `success@razorpay` → `payment.captured` webhook `HMAC` → `paid`
* **Audit:** every rupee `why + bounded_check + consent + remaining` → `GET /api/audit` (hidden behind `/docs` per `docs/product-showcase-ia.md:1` IA 3.5/5)

Single file sources: `server/src/catalog.js:1` 10 SKUs `p1-p10` `Rs25-280` `veg:true`, `server/src/razorpay.js:1` `hasValidKeys()`/`getMode()` `test/mock`, `api/index.js:1` + `server/src/index.js:1` bounded `total<=remaining` `10000/90d` `stock` `consent` + fallback `short_url`.

## 2. Architecture

```
User ──► LLM (Claude/Cursor/ChatGPT App, tool calling + MCP)
            │
            ├─► MCP stdio `mcp-server/src/index.js:1` (5 tools)
            │       list_catalog, get_product, create_agent_checkout,
            │       create_reserve, get_reserve_status
            │       env AGENTCART_API=http://localhost:3001 or https://agentcart-orpin.vercel.app
            │
            └─► HTTP `api/index.js:1` / `server/src/index.js:1`
                    GET /api/catalog?q=&price_max=&category=  (filtered `catalog.js:15`)
                    POST /api/reserve/create {max_block_inr, user_phone} → {reserve:{id,remaining,expires_at,consent_txn_id}} `RESERVE_MAX 10000 RESERVE_DAYS 90`
                    POST /api/checkout/create {items:[{id,qty}], reserve_id, customer} → calcTotal `catalog.js:24` → if total>remaining 400 + audit checkout_blocked_exceeds_reserve + fallback `short_url` (Payment Link Standard in test) else createOrder `amount paise` `razorpay.js:10-14` → orders.set + remaining-=total + debits.push + audit checkout_create → {order:{razorpay_order_id, amount, explainability}, checkout_url, audit}
                    POST /api/webhook/razorpay (HMAC SHA256 `api/index.js:92-98`) → order paid
                    GET /llms.txt:118 10-item catalog (agent-readable) + GET /api/health mode
                    audits[] `server/src/store.js` audit() → GET /api/audit (docs only)
```

**Bounded invariants (must not regress, `docs/architecture.md:24`):** `max_block 10000`, `90d`, `total <= remaining`, `qty <= stock`, consent gated, tamper-proof `order_id`, graceful fallback.

## 3. What the agent needs

### 3.1 AI model (one of)

* **Any LLM with tool/function calling + MCP:** Claude 3.5/4 (Anthropic `MCP 1.0` remote `https://mcp.razorpay.com/mcp` + stdio `mcp-server/src/index.js:1`), Cursor Agent, ChatGPT App (tool calling), Gemini 1.5 + MCP bridge, or any OpenAI-compatible `tools` API.
* **No fine-tune.** Prompt in `web/src/main.jsx:55` `askAI` simulates same logic LLM will run: parse `budget/people/paneer/veg` → `list_catalog {price_max}` → pick cheapest under budget → `create_agent_checkout`.

If model has no MCP, it can call HTTP directly `GET /api/catalog` + `POST /api/checkout/create` `Razorpay API` style — `docs/product-showcase-ia.md:6` AI playground spec.

### 3.2 Runtime

* **Node 20+** `package.json:1` `express cors dotenv razorpay` `vite 5.4.21` `web/dist` `185kB`
* **Server:** `npm run dev` → `http://localhost:3001` `GET /health` `mode:test|mock` `X-Razorpay-Mode` header hidden (`?debug=1` only)
* **Web:** `npm --prefix web run dev` → `http://localhost:5173` product showcase `web/src/main.jsx:1` 482L (header 6 nav hero `Every chat becomes a checkout.` bento live-merchant 5+5 chips AI playground `demo-grid:131` bounded `#rails` `#pricing`)
* **MCP:** `node mcp-server/src/index.js` stdio `AGENTCART_API=http://localhost:3001` (5 tools, see `mcp-server/README.md`)

### 3.3 Razorpay keys (one tier)

* **Developer (no keys):** `mock` `order_mock_*` `short_url` mock via `hasValidKeys()==false` `razorpay.js:7-9` — works without Dashboard, audit fully logged, `Vercel` `https://agentcart-orpin.vercel.app/api/catalog` live `count:10`.
* **Buildathon/Test (you have):** `RAZORPAY_KEY_ID=rzp_test_TXPaQPvvVu85mH` + `RAZORPAY_KEY_SECRET=msCBFS4lHA2VLffUW0wfjijp` `C:\Users\navte\Downloads\rzp-test-key.csv` + `RAZORPAY_WEBHOOK_SECRET=whsec_test_dummy` in `D:\MunderDifflin\agentcart\.env:1` + `vercel env add Production` `Encrypted` — `getMode()==test` → real `order_*` `api.razorpay.com/v1/orders` `amount paise` `POST /v1/orders` `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` `research/knowledge/orders_api.json:1`. Dummy pay `success@razorpay` / `failure@razorpay` via `Checkout.js` + test cards `4111111111111111` `5105105105105100` `378282246310005` `docs/architecture.md:40` + `RAZORPAY_SERVICES.md`.
* **Live (production-ready):** `RAZORPAY_KEY_ID=rzp_live_...` + `Support → activate UPI Reserve Pay SBMD` `max 10000/90d` `research/knowledge/upi_reserve_pay.json:8` — same code `architecture.md:63` `callback_url` + Vercel webhook — no change `server/src/razorpay.js:10-14` `getRazorpay()` handles both `rzp_test_`/`rzp_live_`.

`.env.example:1` documents all 3 tiers.

### 3.4 Catalog (already done)

* **Hotel Pranjal 10-item pure veg** `server/src/catalog.js:2-13` **single source** `p1 Paneer Butter Masala Rs280 paneer 100` `p2 Paneer Tikka Dry Rs260 80` `p3 Veg Biryani Rs199 120` `p4 Dal Tadka+Jeera Rice Rs180 90` `p5 Pav Bhaji Rs120 150` `p6 Veg Thali Rs220 100` `p7 Tandoor Roti Rs25 300` `p8 Masala Fries Rs99 120` `p9 Veg Crispy Chinese Rs190 70` `p10 Cold Coffee Rs80 200` — do not re-derive, `listCatalog():10` `calcTotal()` `catalog.js:24`.

### 3.5 Vercel (hosting)

* `vercel.json:1` `buildCommand: npm --prefix web install --silent && npm --prefix web run build` `outputDirectory: web/dist` `rewrites: /api/(.*) -> /api/index.js` — `git push origin main` auto-deploy `https://agentcart-orpin.vercel.app` `Ready` `5vn0nro1p`→`eay6t8h5t` `204f790` `mode:test`.

## 4. How it runs (any AI, 15s)

1. **Discover:** LLM `GET /api/catalog?price_max=700` or `MCP list_catalog {query:"paneer", price_max:700}` → 10 filtered Hotel Pranjal.
2. **Block:** `POST /api/reserve/create {max_block_inr:10000}` → `{reserve:{id,remaining:1000000,expires_at:+90d,consent_txn_id}}` `RESERVE_MAX 10000 RESERVE_DAYS 90` `api/index.js:32-47` — `explainability: Funds blocked Rs10000, debits until 90d within limit, revocable in UPI app`.
3. **Pay bounded:** `POST /api/checkout/create {items:[{id:"p1",qty:1}], reserve_id, customer:{name,contact,email}}` → `calcTotal` → `if total>remaining → 400 + audit checkout_blocked_exceeds_reserve + fallback short_url` `api/index.js:68-73` else `createOrder {amount paise, receipt, notes:{reserve_id}}` `api/index.js:76` → `razorpay_raw.id` `order_*` or `order_mock_*` → `orders.set` + `reserve.remaining-=total` + `debits.push` + `audit checkout_create` → `{order:{razorpay_order_id, amount, explainability{why,bounded_check,consent}}, checkout_url, audit}` `api/index.js:76-86`.
4. **Checkout:** `checkout_url https://checkout.razorpay.com/v1/checkout.js?order_id=...` → test `success@razorpay` → `payment.captured` webhook → verify `x-razorpay-signature` HMAC → order `paid` `api/index.js:92-108`.
5. **Audit:** every money action → `audits[]` `server/src/store.js` `audit()` — `Last audit: checkout_create #abc bounded_check total<=remaining` on landing, full `audit-pre` behind `/docs` IA 3.5/5.

**AI playground in web** `web/src/main.jsx:131` `demo-grid` left `Ask AI to order` `3 prompt chips` `Vegetarian dinner for two under 700` etc → local `askAI:59-81` simulation (same parse → `list_catalog` → cheapest under budget → fill cart) → `Checkout via Reserve debit` → `Try over-limit → block + fallback link:51`.

## 5. What to install & run

```bash
# 1. Clone + install
git clone https://github.com/Navtesh00/agentcart.git D:\MunderDifflin\agentcart
cd D:\MunderDifflin\agentcart
npm install            # root + server
npm --prefix web install

# 2. Keys (pick one tier)
cp .env.example .env   # no keys → mock; or add rzp_test_TXPaQPvvVu85mH / secret from C:\Users\navte\Downloads\rzp-test-key.csv → test live orders
# .env:
# RAZORPAY_KEY_ID=rzp_test_TXPaQPvvVu85mH
# RAZORPAY_KEY_SECRET=msCBFS4lHA2VLffUW0wfjijp
# RAZORPAY_WEBHOOK_SECRET=whsec_test_dummy

# 3. Run
npm run dev            # server http://localhost:3001 GET /health mode mock/test X-Razorpay-Mode + GET /api/catalog 10 + POST /api/checkout/create bounded
npm --prefix web run dev # web http://localhost:5173 product showcase 6 sections + AI playground demo-grid bounded
node mcp-server/src/index.js # MCP stdio AGENTCART_API=http://localhost:3001 (5 tools) → Claude/Cursor ChatGPT App

# 4. Verify production-ready invariants
curl http://localhost:3001/api/health          # {"mode":"test","reserve_max_paise":1000000}
curl http://localhost:3001/api/catalog?q=veg&price_max=700  # 10 Hotel Pranjal
# Try checkout success@razorpay + over-limit block + fallback short_url + audit
npm --prefix web run build   # vite 5.4.21 185.08kB gzip 56.11kB dist/index.html
vercel env add RAZORPAY_KEY_ID production --value "rzp_test_..." --sensitive --yes # then git push → Vercel https://agentcart-orpin.vercel.app/api/health mode:test
```

**Test dummy data:** `success@razorpay` / `failure@razorpay` `Checkout.js`, cards `4111111111111111` `5105...` `3782...` `research/knowledge/orders_api.json`, UPI `success@razorpay` `failure@razorpay`, reserve `1 block + N debits until 90d` `research/knowledge/upi_reserve_pay.json`.

## 6. Production-ready checklist (for Razorpay demo)

* [x] `mock` hidden behind `?debug=1`/`/docs` not landing badge `api/index.js:19-28` `X-Razorpay-Mode`
* [x] Real `order_*` `paise` `signature` when `RAZORPAY_KEY_ID` `rzp_test_/rzp_live_` `razorpay.js:10-14`
* [x] Bounded `total<=remaining` `stock` `expiry` `consent` `checkout_blocked_exceeds_reserve` + fallback Payment Link audit-logged `api/index.js:68-73`
* [x] `50-order batch 34 ok/16 blocked+16 fallback 52 audits` `docs/architecture.md:45` `docs/eval/results.csv` → re-run with live keys
* [x] Product showcase not dev demo `web/src/main.jsx:1` 482L hero/bento/live-merchant/AI playground/#rails/#pricing `docs/product-showcase-ia.md:1`
* [ ] `rzp_live_` + `Support Reserve Pay SBMD activate` → no code change `vercel env` `live`

## 7. References

* `board.md:1` product showcase initiative `01 done jim-mtkz1oeb 03:42Z / 02 done pam 03:50Z / 03 done jim-mtkzd39p 03:56Z` `done:3/3`
* `tasks.json:1` 01 IA + 02 frontend rebuild deps 01 + 03 Razorpay hardening deps 02
* `docs/product-showcase-ia.md:1` one-pager IA + copy deck verbatim `Every chat becomes a checkout.`
* `docs/architecture.md:1` system diagram + 50-batch
* `research/razorpay-official/02_agentic_payments.md:1` `research/knowledge/upi_reserve_pay.json:1` `orders_api.json:1`
* Live `https://agentcart-orpin.vercel.app/api/catalog` `count:10` `GET /llms.txt` `mcp-server/src/index.js:1`

---
*Status: `mode:test` with your `rzp_test_TXPaQPvvVu85mH` `Production` `Encrypted` — swap to `rzp_live_` via `vercel env` for production without deploy diff.*

# AgentCart Architecture — Track 01 Agentic Commerce

## 1. Problem
Merchants on Razorpay: 70% checkout abandon + invisible to AI buyers (ChatGPT/Claude discovery without transaction). Razorpay Sprint 2026 solves with UPI Reserve Pay (SBMD) + MCP 1.0 `https://mcp.razorpay.com/mcp`.

## 2. Solution
AgentCart = MCP + Express wrapper that makes any catalog AI-buyable with bounded, explainable, gated money actions.

### Core flows
- **Agent-readable catalog**: `GET /api/catalog` + `/llms.txt` — 8 products, price/stock, price bounds. MCP `list_catalog`.
- **Reserve Pay (SBMD sim)**: `POST /api/reserve/create {max_block_inr <=10000}` -> block funds, `remaining`, `expires_at +90d`, `consent_txn_id`, revocable. Mirrors `UPI Reserve Pay limits max 10000 / 90d / multi-debit` `razorpay.com/docs/payments/recurring-payments/upi-reserve-pay`.
- **Bounded checkout**: `POST /api/checkout/create {items:[{id,qty}], reserve_id}` -> `calcTotal()` -> check `total <= reserve.remaining` + stock -> `razorpay.orders.create {amount paise, receipt}` -> Razorpay Order `order_mock_*` in mock, real `order_*` with keys -> debit reserve -> audit. If exceeds -> `400` + `bounded_check failed` + fallback `payment_link` (Standard, `upi_link:false` — UPI links not in test `razorpay.com/docs/api/payments/payment-links/create-standard`).
- **Webhook**: `POST /api/webhook/razorpay` verifies `x-razorpay-signature` HMAC SHA256, updates order `paid`, audit.

## 3. System Diagram
```
[Claude/Cursor/ChatGPT App] -- stdio/MCP --> [agentcart/mcp-server] -- HTTP --> [agentcart/server Express :3001]
                                                        |--> Razorpay Remote MCP https://mcp.razorpay.com/mcp (35+ tools) --> Razorpay API https://api.razorpay.com/v1/orders , /v1/payment_links
                                                        |--> SQLite (memory Maps: reserves, orders, debits, audits)
                                                        |--> Webhook handler -> audit trail
[Web Vite :5173] -- fetch --> [server] (proxy /api)
```

## 4. Trust & Bounded Model
| Rule | Enforcement |
|---|---|
| Max block | `RESERVE_MAX_BLOCK=10000` INR paise check at create |
| Per-debit bound | `total <= reserve.remaining` else blocked + fallback |
| Stock bound | `qty <= stock` else error |
| Expiry | `90d` validity check |
| Consent | `consent_txn_id` stored, gated flag in audit |
| Explainability | Every order stores `why`, `bounded_check`, `consent`, `amount_inr` + audit entry `bounded_check` + `consent` |
| Tamper-proof | Razorpay `order_id` secures amount (cannot tamper) `razorpay.com/docs/api/orders` |
| Graceful failure | Over-limit -> blocked JSON + `short_url` fallback + audit preserved (video timestamp) |

## 5. Test Mode Notes (internet verified)
- `POST /v1/orders` amount in paise, receipt unique. Verify signature server-side `razorpay.com/docs/api/orders/create`.
- `POST /v1/payment_links` Standard Links work in test, UPI links `Not supported in Test Mode` — use Standard.
- Test limit `30 Payment Links / business` — recycled, bulk uses Orders.
- Test UPI: `success@razorpay` / `failure@razorpay`, amount-based error scenarios `razorpay.com/docs/payments/payments/test-upi-details`.
- MCP remote deprecated `/sse` 13 Aug 2025 -> `/mcp` streamable HTTP `razorpay.com/docs/mcp-server/remote`.
- Reserve live requires Support activation + SBMD eligibility — simulated locally with same limits for Buildathon.

## 6. Eval — 50 batch (actual run 2026-09-02)
`D:\MunderDifflin\agentcart\docs\eval\summary.json` -> `total 50, ok 34, blocked 16, fallback 16, audits 51`
All 50 have audit entry; 16 blocked correctly bounded by remaining, each fallback `plink_mock_*` issued.
`results.csv` holds per-order audit id for traceability.

## 7. Showcase mapping to Track 01 bar
- **Explainable**: audit `why bounded_check consent` + dashboard
- **Bounded**: max 10k, per-debit remaining, stock checks
- **Gated**: consent at reserve create, reserve_id required for debit
- **Failure handled**: over-limit video + fallback link
- **Measured**: `results.csv` batch not cherry-picked

## 8. Deploy & Submit
- Env: `RAZORPAY_KEY_ID/SECRET` test keys, `RAZORPAY_WEBHOOK_SECRET`, `PORT=3001`
- Run: `npm install && npm run dev:server & dev:web & dev:mcp`
- Public: `Vercel (web) + Render (server) + ngrok webhook` -> update `callback_url`
- Submit: `https://forms.gle/d9r2gvxp8cmoZhon9` with repo + 5min video (script in README) + architecture link

## 9. Next for live Razorpay
Swap mock `createOrder/createPaymentLink` with real keys + enable Reserve Pay via Support + point webhook to live URL. No code change in bounded logic.

# AgentCart — Razorpay Buildathon Track 01

**Make any Razorpay merchant AI-buyable in-chat. 5min setup.**

Live problem: 70% checkout drop + invisible to LLM shoppers. Fix: agent-readable catalog + conversational checkout with bounded UPI Reserve Pay (SBMD) simulation + audit trail.

## Why this wins Track 01 bar
- Every money action `explainable, bounded, gated` — blocked amount, remaining, consent id logged
- Audit trail JSON + graceful failure -> Payment Link fallback (video timestamped)
- Measured batch: 50 orders via Razorpay test-mode `success@razorpay` / `failure@razorpay`
- MCP 1.0 `https://mcp.razorpay.com/mcp` + Razorpay Orders/Payment Links (standard links, 30 limit recycled)

## Quick start (no keys needed — mock mode auto)
```bash
npm install
npm run dev:server  # http://localhost:3001
npm run dev:web     # http://localhost:5173
npm run dev:mcp     # MCP stdio
npm --workspace server run test # validates full flow
```
Add `.env` with test keys to hit real Razorpay Orders API. Without keys, server runs in mock mode (verifiable audit).

## Repo
- `server/` — Express + Razorpay Orders/Payment Links + Reserve simulation + Audit + Webhook
- `mcp-server/` — MCP tools: list_catalog, get_product, create_agent_checkout
- `web/` — Vite catalog + chat widget + merchant dashboard
- `docs/architecture.md` + `docs/eval/results.csv`

## Apply
Repo + 5min video + architecture -> https://forms.gle/d9r2gvxp8cmoZhon9

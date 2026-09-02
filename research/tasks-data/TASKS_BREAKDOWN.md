# AgentCart — Divided Tasks & Data Collection Plan

**Principle: not one go — staged, data-first, reusable folder `research/`**

## Folder Layout
```
research/
  razorpay-official/   # live webfetch md
  knowledge/           # API/MCP/SBMD specs json
  client-data/         # synthetic merchant/catalog/batch json
  tasks-data/          # per-task data + checklist
```

## Steps — Decide First, Then Build

### Phase 0 — Research (DONE, data saved)
- **Task 0.1** Re-check https://razorpay.com/ : products, AI Native, pricing, trust. Data: `research/razorpay-official/01_home.md`
- **Task 0.2** Agentic Payments deep dive: In-App/LLM/Voice, UPI Reserve Pay live, Circle coming, 40+ tools. Data: `02_agentic_payments.md`
- **Task 0.3** Payment Gateway specifics: success rate, 100+ methods, curl Orders, integrations. Data: `03_payment_gateway.md`
- **Task 0.4** Replit partnership: UPI INR, cross-border USD settlement, built-in monetisation. Data: `04_replit_partnership.md`
- **Task 0.5** Buildathon+Sprint: 5 tracks, Track01 bar bounded/gated/audit, Vulcan 3T/4B. Data: `05_buildathon_sprint.md`

### Phase 1 — Client & Domain Data (DONE)
- **Task 1.1** Merchants: 5 personas demo-deli/grocery/fashion/SaaS/builder. Data: `client-data/merchants.json`
- **Task 1.2** Catalog synthetic 8 SKUs with price_paise/stock/category. Data: `client-data/catalog_synthetic.json` + live `server/src/catalog.js`
- **Task 1.3** Batch 50: actual 34 ok /16 blocked fallback from eval run. Data: `client-data/transactions_batch_50.json` + `docs/eval/results.csv`

### Phase 2 — Knowledge Base (DONE)
- **Task 2.1** UPI Reserve Pay SBMD spec (10000/90d/N debits, flow 4 steps). Data: `knowledge/upi_reserve_pay.json`
- **Task 2.2** MCP 1.0 spec (remote https://mcp.razorpay.com/mcp, 35+ tools, OAuth). Data: `knowledge/mcp_server.json`
- **Task 2.3** Orders/Payment Links/Test UPI spec (30 links limit, success@razorpay). Data: `knowledge/orders_api.json`

### Phase 3 — Design (data to collect next, per task)
- **Task 3.1** Architecture diagram + sequence: data `tasks-data/03_architecture.json` (collect: diagram png, sequence mermaid, trust table)
- **Task 3.2** API contract: data `tasks-data/03_api_contract.json` (collect: OpenAPI snippet, bounded rules table)
- **Task 3.3** UX flows: data `tasks-data/03_ux.json` (collect: Figma link, catalog grid, chat widget, dashboard wireframe)

### Phase 4 — Build (data per task)
- **Task 4.1** Server: data `tasks-data/04_server.json` (collect: health/catalog/reserve/checkout/webhook tests logs)
- **Task 4.2** MCP server: data `tasks-data/04_mcp.json` (collect: tool list, stdio test log)
- **Task 4.3** Web: data `tasks-data/04_web.json` (collect: Vite build stats 146kB gzip 47kB, dist listing)
- **Task 4.4** Integration: data `tasks-data/04_integration.json` (collect: 50 batch run output, audit 52, webhook verified)

### Phase 5 — Test & Evidence
- **Task 5.1** Unit: catalog calcTotal, reserve gates. Data: `tasks-data/05_tests.json`
- **Task 5.2** E2E: over-limit fallback demo video timestamp + audit ids. Data: `docs/eval/` + `tasks-data/05_e2e.json`
- **Task 5.3** Performance: health latency, catalog filter. Data: `tasks-data/05_perf.json`

### Phase 6 — Deploy & Showcase
- **Task 6.1** GitHub: data `tasks-data/06_github.json` (repo https://github.com/Navtesh00/agentcart main 7b26f25)
- **Task 6.2** Vercel: data `tasks-data/06_vercel.json` (collect: deployment URL, env vars, build log)
- **Task 6.3** Video/Pitch: data `tasks-data/06_pitch.json` (collect: 5min storyboard, architecture png, results.csv)

## How to Use Folder
- Every task reads only its `tasks-data/*.json` + shared `knowledge/` + `client-data/` — add as much data as needed, never hardcode in code.
- To extend: add new JSON in `research/` and reference in code via `import` or runtime fetch.
- Current local run uses mock mode, so data collection does not require live keys — swap to real via `.env` without code change.

## Next Data to Collect (requires your approval/tools)
- Figma/wireframe for UX (if you have), or I generate in `tasks-data/03_ux.json`
- Real Razorpay test keys (if you provide) -> store in `.env` not repo, used by `knowledge/orders_api.json` expansion
- Vercel deployment log after you approve `https://vercel.com/new` import

*This breakdown follows razorpay.com official context — every step maps to a Track01 deliverable (repo + video + architecture + measured batch + audit).*

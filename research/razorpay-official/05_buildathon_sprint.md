# Buildathon + Sprint 2026 Context

Source: https://razorpay.com/buildathon/ + https://razorpay.com/sprint/26

## Buildathon Tracks (student-only, 6/12mo intern Rs75000 Bangalore Sep)
1. AI Growth & Agentic Commerce — agent grows revenue or makes merchant transactable by AI buyer on Razorpay test-mode APIs. Protocol race UAP/ACP/AP2/x402. Examples: conversational in-app checkout, agent-readable catalog, upsell agent. Bar: every money action explainable/bounded/gated + audit +1 failure gracefully.
2. AI Risk Manager — detector for fraud/returns/chargebacks with precision/recall on held-out set, defense-only.
3. AI Revenue Recovery — detect at-risk revenue + bounded recovery workflow (payment failures/checkout abandon/fail sub/overdue receivables/B2B chaser). Bar: measured money recovered + compliant escalation + stopping rules.
4. AI Finance Controller — close finance-ops loop across 50+ synthetic batch, match rate + exceptions.
5. Open Track — any real problem with meaningful AI, same depth bar.

Apply: https://forms.gle/d9r2gvxp8cmoZhon9 — repo + 5min pitch video + architecture.

## Sprint 2026 — Age of AI-Native Payments (100+ launches)
- Agentic Stack, Payments on In-App Chats / LLMs (ChatGPT Apps) / Voice, Ray Smart Assist, Agent Studio
- Vulcan AI foundation with NVIDIA/AWS (3T data points / 4B payments, 3000 signals/txn, 8-10% success lift, 8x fraud detection)
- Razorpay Node for n8n, Razorpay x Replit, MCP 1.0, Dashboard on Claude

## Official Problem Context (from 2026 blogs + Terra insight)
- Scale: 12M merchants, $180B TPV annualized, 55% PG share
- Friction: payment inexplicably fails not lack of funds but wrong routing path at millisecond
- Fraud: 400% fraud spike, card fraud +25%, friendly fraud 79%, VAMP 1.5% threshold Apr 2026
- Revenue leak: MDR 7 cells blended (2% standard +3% premium +0.99% subscription add-on + 200-750 chargeback fees), refund MDR not reversed, UPI platform fee vs network MDR confusion
- Ops: settlement/reconciliation/forecasting manual, verification bottleneck

*AgentCart picks Track 01 because it aligns with Agentic Payments live pilot + web skills, bounded checkout with UPI Reserve Pay.*

# Razorpay Services — Official Reference (2026)

> Source: https://razorpay.com/ + https://razorpay.com/agentic-payments/ + https://razorpay.com/payment-gateway/ + https://razorpay.com/x/ — fetched 2026-09-02. Razorpay is India's All-in-One Finance Platform, 1,50,000+ businesses, RBI Authorised Payment Aggregator (Razorpay Payments Pvt Ltd from Jan 1 2026), PCI DSS L1.

## 1. Accept Payments

| Product | What it does |
|---------|--------------|
| **Payment Gateway** | Website/app checkout, 100+ methods (Cards, UPI, Netbanking, Wallets), high success via intelligent routing (`Optimizer`), conversion-optimized |
| **Payment Links** | Share link via email/SMS/social — no website needed |
| **Payment Pages** | Custom-branded hosted online store, zero code |
| **Payment Buttons** | Add Pay Now button to any site, no code |
| **QR Codes** | UPI + card QR for offline/online |
| **Razorpay POS / ePOS** | In-store card/UPI, mobile POS |
| **Subscriptions** | Recurring — UPI AutoPay, eMandate (Netbanking/Debit), Cards |
| **Smart Collect** | Virtual accounts (NEFT/RTGS/IMPS) with auto-reconciliation |
| **Optimizer** | AI routing across multiple gateways |
| **International Payments** | 100+ currencies gateway + MoneySaver Export Account (200+ countries virtual accounts ACH/SWIFT/SEPA/BACS) |
| **Magic Checkout / Flash Checkout / Turbo UPI** | 1-step UPI, saved addresses, faster conversion |
| **Instant Settlements** | Customer pay → bank instantly (vs T+1) |
| **Route / Invoices / TokenHQ / App Store** | Marketplace splits, invoicing, card tokenisation, plugins |

## 2. Payouts — RazorpayX

- **API & Bulk Payouts** — 50k payouts in one click/dashboard, pay vendors/employees/partners instantly, AI multi-bank router
- **Source to Pay** — vendor payables control + optimisation
- **Payout Links** — pay recipient without bank details
- **Tax Payments** — TDS/GST online one-click

## 3. Business Banking — RazorpayX

- **Current Account** — fully-functional, powered by ICICI / RBL / Yes (RBI licensed banks; RazorpayX is not a bank)
- **Escrow+ Account** — automated escrow with banks/trustees/TSP
- **Forex / FDI Management** — foreign funding expert support
- **Corporate Credit Cards** — Visa, spend controls + savings
- **Accounting Integration** — sync with accounting software
- **Bank Account Verification, Vendor Payments**

> Disclaimer: Current Account & Visa Corporate Card provided by RBI licensed banks.

## 4. Payroll — RazorpayX Payroll

- **Payroll for Startups / Enterprises / CAs** — salary processing + compliance (TDS, PF, ESI) + direct bank transfers

## 5. Credit & Working Capital

- **Instant Settlements**, **Line of Credit**, **Digital Lending 2.0** — working capital loans

## 6. AI Native — Sprint 2026: Age of Agentic Payments

- **Agentic Payments** — 3 surfaces: **In-App Commerce** (embed contextual checkout), **On LLMs** (ChatGPT Apps/Claude — discovery → in-chat transaction), **Voice AI** (hands-free) — built with NPCI + OpenAI
- **Agentic Methods** — `UPI Reserve Pay (Live)` SBMD block up to ₹10,000 / 90 days / N debits within limit, revocable; `UPI Circle (coming soon)` delegated/shared auth
- **Agent Studio** — ops agents for finance
- **Payments for AI Builders** — Razorpay Node for n8n, Replit, Vercel workflows (+ Replit partnership 2026-02-19: UPI INR + USD settlement + built-in monetisation)
- **Agentic Business Banking** — finance-team-in-a-box
- **MCP & APIs** — 40+ composable tools, `MCP 1.0` at `https://mcp.razorpay.com/mcp` (streamable HTTP, 35+ tools: capture/fetch Orders, Payment Links, Refunds, Settlements, Payouts, Checkout)

## 7. For Developers

- **Integrations** — SDKs: Android, iOS, Web, PHP, Python, Ruby, Java; plugins Shopify/WooCommerce/Magento/Wix
- **API** — REST `https://api.razorpay.com/v1/orders` — Basic Auth `key_id:key_secret` (from Dashboard)
- **Webhooks** — real-time payment events
- **OpenAPI Spec** — `https://razorpay.com/openapi.json`, Playground — `https://razorpay.com/docs/api/`
- **Quick start:**
```bash
curl -X POST https://api.razorpay.com/v1/orders \
  -U [YOUR_KEY_ID]:[YOUR_KEY_SECRET] \
  -H 'content-type: application/json' \
  -d '{"amount":500,"currency":"INR","receipt":"qwsaq1"}'
```

## 8. Industry Solutions

| Industry | Use case |
|----------|----------|
| E-commerce / D2C | Online + in-store unified, higher conversion, fraud minimisation |
| Education | Fee collection + vendor payouts |
| BFSI | Collections, recurring, loan disbursement |
| SaaS | 100+ currencies, subscriptions, payouts |
| Freelancers | No website/coding needed |

*Examples:* Swiggy, Zomato, BookMyShow, Zepto, Lenskart, Tally, Whole Truth.

## Registry

- **Company:** Razorpay Software Limited, SJR Cyber, 22 Laskar Hosur Rd, Adugodi, Bengaluru 560030, CIN U62099KA2024PTC188982, founded 2014
- **Docs:** https://razorpay.com/docs/ — Support: https://razorpay.com/support/

---
*Generated for AgentCart research/razorpay-official — verify live at https://razorpay.com/*

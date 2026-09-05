<div align="center">

# 🛒 AgentCart

### The authorization layer between AI agents and payment rails.

<p>
  <strong>AI can discover.</strong>
  &nbsp;→&nbsp;
  <strong>AI can decide.</strong>
  &nbsp;→&nbsp;
  <strong>AI can prepare.</strong>
  &nbsp;→&nbsp;
  <strong>👤 Human releases the money.</strong>
</p>

<p>
  <img src="https://img.shields.io/badge/Razorpay-Buildathon-blue?style=for-the-badge&logo=razorpay" />
  <img src="https://img.shields.io/badge/Track-01-purple?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Agentic-Commerce-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Status-Working%20Prototype-success?style=for-the-badge" />
</p>

<p>
  <a href="https://agentcart-orpin.vercel.app">
    <img src="https://img.shields.io/badge/🚀%20LIVE%20DEMO-Visit%20AgentCart-brightgreen?style=for-the-badge" />
  </a>
</p>

</div>

---

## 🧠 The idea in one sentence

> **AgentCart gives AI agents bounded spending authority without giving them unrestricted control over a user's money.**

Traditional payment infrastructure answers:

> **"Can this application make a payment?"**

Agentic commerce needs to answer something harder:

> **"What is this agent allowed to spend, under which conditions, and who authorized the final transaction?"**

AgentCart sits between the AI agent and the payment rail to enforce that boundary.

```text
                    ┌──────────────────┐
                    │     AI AGENT     │
                    │                  │
                    │ Discover         │
                    │ Decide           │
                    │ Prepare          │
                    └────────┬─────────┘
                             │
                             ▼
              ┌────────────────────────────┐
              │         AGENTCART          │
              │                            │
              │  Identity                 │
              │  Spending boundaries      │
              │  Reserve accounting       │
              │  Policy checks            │
              │  Human approval           │
              │  Audit trail              │
              └─────────────┬──────────────┘
                            │
                     Authorized payment
                            │
                            ▼
                   ┌─────────────────┐
                   │    RAZORPAY     │
                   │  Payment Rails  │
                   └─────────────────┘
```

### The principle

> **Agents get authority, not credentials.**

---

# ⚡ Why this layer is necessary

AI agents can already:

* understand natural-language requests
* search products
* compare prices
* make decisions
* construct carts
* initiate actions

But payment infrastructure historically assumes that the actor initiating the transaction is either:

* a human, or
* a trusted application with broad credentials.

Agentic commerce changes that.

An AI agent may be capable of making decisions without being appropriate to give it unrestricted financial authority.

That creates four separate questions:

| Question                        | AgentCart primitive |
| ------------------------------- | ------------------- |
| **Who is calling?**             | HMAC Agent Identity |
| **What can they spend?**        | Bounded Reserve     |
| **Who releases the money?**     | Human Approval      |
| **Why was it allowed/blocked?** | Audit Engine        |

This is the control layer AgentCart demonstrates.

---

# 🧩 Three primitives for agentic commerce

<div align="center">

### 🔎 DISCOVER → 💰 AUTHORIZE → 👤 APPROVE

</div>

### 01 — Agent-readable Catalog

Give agents a structured representation of merchant inventory.

```text
GET /api/catalog
GET /api/catalog?price_max=300
GET /api/catalog/:id
/llms.txt
```

Agents can reason over:

* products
* prices
* categories
* stock
* availability
* merchants

No browser scraping is required for the core catalog flow.

---

### 02 — Bounded Reserve Pay

Instead of giving an agent unrestricted payment credentials:

```text
┌─────────────────────────┐
│       RESERVE           │
├─────────────────────────┤
│ Maximum authority       │
│                         │
│       ₹1,000            │
│                         │
│ Remaining               │
│       ₹1,000            │
│                         │
│ Validity                │
│       90 days           │
│                         │
│ Status                  │
│       ACTIVE             │
└─────────────────────────┘
```

The agent receives **bounded authority**.

Example:

```text
Purchase #1
₹320
       ↓
Remaining ₹680

Purchase #2
₹180
       ↓
Remaining ₹500

Purchase #3
₹600
       ↓
      🚫
   BLOCKED
```

The reserve is not intended to be an unrestricted wallet.

It is a **spending boundary** enforced before payment execution.

---

### 03 — Human-in-the-Loop Approval

The agent can prepare the transaction.

The agent cannot independently release the money.

```text
         AI AGENT
            │
            │ browse
            ▼
        Catalog
            │
            │ select
            ▼
       Prepare cart
            │
            │ request capability
            ▼
     ┌──────────────┐
     │ AGENT STOPS  │
     └──────┬───────┘
            │
            ▼
          👤 HUMAN
            │
        review + PIN
            │
          approve
            ▼
       💳 RAZORPAY
```

**The agent can request authorization. It cannot redeem human authorization.**

---

# 🔐 The security boundary

This is one of the most important design decisions in AgentCart.

The approval PIN is generated server-side.

The agent does not get the PIN.

The final payment execution occurs through the human approval flow.

```text
                         TRUST BOUNDARY
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│                        AI AGENT                          │
│                                                          │
│  ✓ Browse catalog                                        │
│  ✓ Get products                                          │
│  ✓ Create reserve                                        │
│  ✓ Prepare checkout                                      │
│  ✓ Request approval capability                           │
│                                                          │
│  ✗ Cannot see approval PIN                               │
│  ✗ Cannot independently release funds                    │
│  ✗ Cannot bypass reserve limits                          │
└───────────────────────────┬──────────────────────────────┘
                            │
                            │ handoff
                            ▼
┌──────────────────────────────────────────────────────────┐
│                         HUMAN                            │
│                                                          │
│  ✓ Review order                                          │
│  ✓ See approval information                              │
│  ✓ Explicitly approve                                    │
│  ✓ Browser redeems capability                            │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   RAZORPAY    │
                    │               │
                    │ Payment       │
                    └───────────────┘
```

---

# 🔑 Three authentication mechanisms

AgentCart deliberately separates the three paths.

### Agent requests

**HMAC**

```text
x-agent-id
x-nonce
x-timestamp
x-signature
```

Used for:

* agent identity
* request authentication
* timestamp validation
* replay protection
* per-agent secrets

---

### Human approval

**Capability token**

Short-lived and one-time-use.

Bound to:

```text
reserve
+
approval flow
+
expiration
```

The agent can request the token.

The human browser redeems it.

---

### Dashboard

**Bearer session**

The agent's dashboard access is kept separate from the financial write path.

Viewing history should not imply permission to execute payments.

---

# 🛒 A real transaction

Here's what happens when someone types:

```text
"Get me vegetarian dinner for two under ₹700."
```

### The complete flow

```text
Natural language
       │
       ▼
┌──────────────┐
│ AI Agent     │
└──────┬───────┘
       │
       ▼
🔎 Search catalog
       │
       ▼
🧠 Select products
       │
       ▼
💰 Create reserve
       │
       ▼
🛒 Prepare cart
       │
       ▼
🔐 Request capability
       │
       ▼
👤 Human approval
       │
       ▼
💳 Razorpay
       │
       ▼
📡 Webhook
       │
       ▼
📜 Audit
```

---

# 🔬 The actual API sequence

This isn't a conceptual mock flow.

These are the implemented API stages.

### 01 — Browse

```http
GET /api/catalog?price_max=300
```

Returns catalog results with price and stock information.

---

### 02 — Create reserve

```http
POST /api/reserve/create
```

```json
{
  "max_block_inr": 500,
  "consent": true
}
```

A reserve is created.

A server-side approval PIN is generated.

**No payment occurs.**

---

### 03 — Prepare checkout

```http
POST /api/checkout/create
```

```json
{
  "items": ["..."],
  "reserve_id": "res_..."
}
```

The cart is associated with the reserve.

```text
status = pending_approval
```

Still:

```text
₹0 charged
```

---

### 04 — Request approval capability

```http
POST /api/approval/request-token
```

```json
{
  "reserve_id": "res_..."
}
```

The server returns a short-lived handoff capability.

---

### 05 — Agent stops

The agent sends the human a checkout URL.

```text
"Your order is ready.

Please review and approve:
<checkout_url>"
```

---

### 06 — Human approves

The human reviews the transaction and enters the required approval information.

---

### 07 — Human browser executes

```http
POST /api/checkout/approve
```

```text
reserve_id
approval_token
idempotency_key
```

Only now does AgentCart:

```text
Validate reserve
      ↓
Check remaining authority
      ↓
Validate approval capability
      ↓
Validate cart
      ↓
Create Razorpay order
      ↓
Debit reserve
      ↓
Consume approval
```

---

### 08 — Razorpay payment

The human completes payment through Razorpay Test Mode.

---

### 09 — Webhook

Razorpay confirms the payment through the webhook flow.

```text
PAYMENT PENDING
       │
       ▼
Razorpay webhook
       │
       ▼
      PAID
```

The transaction is then reflected in the audit trail.

---

# 🚫 The failure case is the point

A good agentic payment system shouldn't only demonstrate successful purchases.

It should demonstrate what happens when the agent **tries something it isn't authorized to do.**

Suppose:

```text
Reserve:
₹500

Remaining authority:
₹500

Agent requests:
₹620
```

AgentCart evaluates:

```text
requested_amount > remaining_authority
```

Result:

```text
┌───────────────────────────────┐
│       🚫 TRANSACTION BLOCKED  │
├───────────────────────────────┤
│ Requested       ₹620          │
│ Remaining       ₹500          │
│                               │
│ Payment created       NO      │
│ Money released        ₹0      │
│                               │
│ Reason: over_limit            │
└───────────────────────────────┘
```

The reserve remains intact.

The failed authorization becomes an auditable event.

If appropriate, AgentCart can issue a fallback Razorpay Payment Link so the human can still complete the purchase outside the bounded reserve.

### This creates an important distinction:

> **The agent's policy can fail without the customer's checkout having to fail.**

---

# 📜 Every decision is explainable

AgentCart doesn't simply record:

```text
Payment failed
```

It records why.

Example:

```json
{
  "event": "RESERVE_DEBIT_BLOCKED",
  "agent_id": "agent_01",
  "reserve_id": "res_92",
  "requested_amount": 620,
  "remaining_authority": 500,
  "bounded_check": "FAILED",
  "consent": true,
  "payment_created": false
}
```

This answers:

```text
WHO attempted it?
WHAT did they attempt?
WHAT authority did they have?
WHY was it blocked?
DID any money move?
```

That's important when software begins making decisions on behalf of people.

---

# 🧠 Why not just give the AI a Razorpay API key?

Because:

> **Authentication ≠ Authorization**

A credential can answer:

```text
"Can this application call the API?"
```

But agentic commerce needs:

```text
"Should this agent be allowed to spend this amount
on this transaction under this authorization?"
```

AgentCart introduces that decision layer.

```text
Traditional
────────────────────

Application
     │
     ▼
Razorpay API
     │
     ▼
Payment
```

```text
Agentic
────────────────────

AI Agent
   │
   ▼
Agent Identity
   │
   ▼
Spending Policy
   │
   ▼
Reserve Authority
   │
   ▼
Cart Validation
   │
   ▼
Human Approval
   │
   ▼
Razorpay
```

---

# 💳 Why not just use Payment Links?

Payment Links solve **payment collection**.

They don't by themselves provide the agent-control layer.

Agentic commerce additionally needs:

* machine-readable catalogs
* agent identity
* bounded authority
* reserve accounting
* policy enforcement
* human/agent separation
* auditability

AgentCart actually uses Payment Links as a **fallback path** when a transaction falls outside the agent's delegated authority.

---

# 🧩 MCP integration

AgentCart exposes its commerce capabilities to MCP-compatible AI agents.

```text
                    MCP CLIENT
                        │
                        ▼
              ┌──────────────────┐
              │    AgentCart     │
              │    MCP Server    │
              └────────┬─────────┘
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
   Catalog          Reserve          Checkout
```

Available tools:

```text
🔎 list_catalog
🔎 get_product

💰 create_reserve
🛒 create_agent_checkout
🔐 request_approval_capability

📊 get_reserve_status

🔒 create_agent_payment
   └── Human approval path only
```

The goal is simple:

> **An MCP-compatible agent should be able to shop without every merchant building a custom agent integration from scratch.**

---

# 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         AI AGENT                            │
│                                                             │
│        Claude / Cursor / ChatGPT / MCP-compatible AI       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                       HMAC-signed requests
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       AGENTCART API                         │
│                          Express                            │
│                                                             │
│  ┌──────────────┐     ┌────────────────────┐               │
│  │   Catalog    │     │  Reserve / Policy  │               │
│  │    Engine    │     │       Engine       │               │
│  └──────────────┘     └────────────────────┘               │
│                                                             │
│  ┌──────────────┐     ┌────────────────────┐               │
│  │     HITL     │     │       Audit        │               │
│  │   Approval   │     │       Engine       │               │
│  └──────────────┘     └────────────────────┘               │
│                                                             │
│                    SQLite + WAL                             │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         RAZORPAY                            │
│                                                             │
│       Orders API · Payment Links · Webhooks · Test Mode    │
└─────────────────────────────────────────────────────────────┘
```

---

# 🔄 Transaction state

```text
                 ┌───────────────┐
                 │    RESERVE    │
                 │     ACTIVE    │
                 └───────┬───────┘
                         │
                         ▼
                ┌────────────────┐
                │ CHECKOUT       │
                │ PREPARED       │
                └───────┬────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ PENDING_APPROVAL │
               └────────┬─────────┘
                        │
                 👤 Human approves
                        │
                        ▼
                ┌─────────────────┐
                │ PAYMENT PENDING │
                └────────┬────────┘
                         │
                   Razorpay webhook
                         │
                         ▼
                    ┌─────────┐
                    │   PAID  │
                    └─────────┘
```

The important separation:

```text
PREPARE ≠ PAY
```

---

# 📊 What we measured

We ran a **50-order evaluation batch** against the implemented bounded-checkout logic.

<div align="center">

| Metric                    | Result |
| :------------------------ | -----: |
| 🧪 Orders attempted       | **50** |
| ✅ Succeeded within budget | **34** |
| 🚫 Correctly blocked      | **16** |
| 🔗 Fallback links issued  | **16** |
| 📜 Audit entries written  | **51** |

</div>

Every blocked order had a reason attached.

Every fallback link was a real Razorpay artifact.

Evaluation data:

```text
docs/eval/results.csv
```

---

# 🎬 Try it yourself

### Live demo

<a href="https://agentcart-orpin.vercel.app">
  <img src="https://img.shields.io/badge/🚀%20Open%20AgentCart-Live%20Demo-brightgreen?style=for-the-badge" />
</a>

### 60-second test

Open the **AI Playground** and try:

```text
Paneer for 3 under ₹800
```

or:

```text
Get me vegetarian dinner for two under ₹700
```

Then watch:

```text
USER REQUEST
     ↓
AI SEARCH
     ↓
CATALOG
     ↓
CART
     ↓
RESERVE
     ↓
APPROVAL
     ↓
RAZORPAY
```

Then deliberately exceed the remaining reserve.

Watch the system block the transaction and generate the fallback path.

---

# ⚙️ Tech stack

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-003B57?style=for-the-badge&logo=postgresql&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-3395FF?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-Agent%20Tools-purple?style=for-the-badge)

</div>

---

# 📁 Repository

```text
agentcart/
│
├── server/
│   ├── Express API
│   ├── SQLite store
│   ├── catalog engine
│   ├── reserve engine
│   ├── approval engine
│   ├── audit engine
│   └── Razorpay integration
│
├── mcp-server/
│   └── MCP stdio server
│
├── web/
│   ├── storefront
│   ├── AI Playground
│   ├── checkout approval UI
│   └── dashboard
│
├── docs/
│   ├── architecture
│   ├── agent-flow
│   └── evaluation
│
└── research/
    └── Razorpay research
```

---

# 🚀 Run locally

```bash
npm install

npm run dev:server
# Backend → http://localhost:3001

npm run dev:web
# Frontend → http://localhost:5173

npm run dev:mcp
# MCP stdio server

npm test
# Evaluation suite
```

AgentCart runs in **mock mode** with zero Razorpay setup.

Mock orders look like:

```text
order_mock_*
```

Add Razorpay Test Mode credentials to `.env` to execute against real Razorpay test infrastructure.

See:

```text
.env.example
```

---

# 🧪 Razorpay Test Mode

```text
UPI success:
success@razorpay

UPI failure:
failure@razorpay

Test card:
4111 1111 1111 1111
```

---

# 🏭 What would production require?

This is a buildathon prototype, not a claim of production readiness.

The important part is that the remaining gaps are understood.

| Area                 | Buildathon        | Production                     |
| -------------------- | ----------------- | ------------------------------- |
| PIN delivery         | Browser endpoint  | Isolated SMS/email channel     |
| Database             | SQLite + WAL      | PostgreSQL + row locking       |
| Catalog              | Live fetching     | TTL cache / Redis              |
| Pagination           | Up to 50          | Default 10 + paging            |
| Reserve cancellation | Not user-facing   | Authenticated cancellation API |
| API versioning       | `/api/...`        | `/api/v1/...`                  |
| Webhooks             | Direct processing | Durable retry queue            |
| Deployment           | Free tier         | Multi-instance infrastructure  |

### Why be explicit about this?

Because there is a difference between:

> **"This proves the model works."**

and:

> **"This is ready to process production-scale financial traffic."**

AgentCart is currently demonstrating the first.

---

# 🎯 Why Razorpay?

Razorpay already provides the payment rails.

Agentic commerce needs another layer above those rails.

```text
                    PAYMENT RAILS
                         │
                         ▼
                 ┌──────────────┐
                 │   Razorpay   │
                 └──────┬───────┘
                        ▲
                        │
                 AgentCart
              CONTROL / POLICY
                        ▲
                        │
                    AI AGENT
```

The opportunity is not to rebuild payment infrastructure.

It is to make existing payment infrastructure **safe and usable for delegated AI commerce**.

AgentCart demonstrates one possible implementation:

```text
Machine-readable commerce
          +
Agent identity
          +
Bounded authority
          +
Human authorization
          +
Explainable audit
          ↓
     Agent-safe commerce
```

---

# 💡 The core insight

Traditional software asks:

> **"Does this application have access?"**

Agentic commerce needs to ask:

> **"What authority has this agent been delegated?"**

That is the distinction AgentCart is built around.

The agent should be able to act **on behalf of the user** without being able to act **as the user**.

---

<div align="center">

# 🛒 AgentCart

### Discover → Decide → Prepare → Approve → Pay → Audit

<br>

> **An AI agent should be able to act on your behalf without becoming you.**

<br>

**Built solo for Razorpay Buildathon · Track 01**

<br>

<a href="https://agentcart-orpin.vercel.app">
<img src="https://img.shields.io/badge/🚀%20LIVE%20DEMO-brightgreen?style=for-the-badge" />
</a>

</div>

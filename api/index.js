import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { listCatalog, getProduct, calcTotal, categoriesData } from "../server/src/catalog.js";
import { reserves, orders, debits, audits, nextId, audit, resetStore } from "../server/src/store.js";
import { createOrder, createPaymentLink, getRazorpay, getMode } from "../server/src/razorpay.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RESERVE_MAX = parseInt(process.env.RESERVE_MAX_BLOCK || "10000", 10) * 100;
const RESERVE_DAYS = parseInt(process.env.RESERVE_VALID_DAYS || "90", 10);

app.get("/health", (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  res.json({ ok: true, mode, reserve_max_paise: RESERVE_MAX, time: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  res.json({ ok: true, mode, reserve_max_paise: RESERVE_MAX, time: new Date().toISOString() });
});
app.get("/api/catalog", (req, res) => {
  const { q, price_min, price_max, category } = req.query;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const result = listCatalog({ query: q, price_min: price_min ? Number(price_min) : null, price_max: price_max ? Number(price_max) : null, category, limit, offset });
  const products = result.products.map(p => ({ ...p, price_inr: p.price / 100 }));
  res.json({ count: result.count, total: result.total, offset: result.offset, limit: result.limit, products });
});
app.get("/api/catalog/:id", (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});

app.post("/api/reserve/create", (req, res) => {
  const { user_phone = "9999999999", max_block_inr, consent = true } = req.body || {};
  const amountPaise = Math.round((max_block_inr || 10000) * 100);
  if (!consent) return res.status(400).json({ error: "consent required — UPI PIN authorisation simulated" });
  if (amountPaise > RESERVE_MAX) {
    const a = audit("reserve_create_blocked", { max_block_inr }, { error: `exceeds max ${RESERVE_MAX/100}` }, { bounded_check: `max ${RESERVE_MAX/100} INR`, consent: false });
    return res.status(400).json({ error: `Bounded check failed: max block is Rs ${RESERVE_MAX/100}`, audit: a });
  }
  const id = nextId("rsv");
  const now = Date.now();
  const expires_at = new Date(now + RESERVE_DAYS * 24 * 3600 * 1000).toISOString();
  const r = { id, user_phone, max_block: amountPaise, remaining: amountPaise, created_at: new Date(now).toISOString(), expires_at, consent_txn_id: `consent_${Date.now()}`, status: "active" };
  reserves.set(id, r);
  const a = audit("reserve_create", { max_block_inr, user_phone }, r, { bounded_check: `within ${RESERVE_MAX/100}`, consent: true });
  res.json({ reserve: r, audit: a, explainability: `Funds blocked Rs ${amountPaise/100}, debits allowed until ${expires_at} within limit, revocable in UPI app` });
});

app.get("/api/reserve/:id", (req, res) => {
  const r = reserves.get(req.params.id);
  if (!r) return res.status(404).json({ error: "reserve not found" });
  res.json(r);
});

app.post("/api/checkout/create", async (req, res) => {
  try {
    const { items, reserve_id, customer = {} } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items [{id, qty}] required" });
    const { total, details } = calcTotal(items);
    let bounded_check = `total Rs ${total/100} within stock & price bounds`;
    let consent = true;
    let reserve = null;
    if (reserve_id) {
      reserve = reserves.get(reserve_id);
      if (!reserve) return res.status(404).json({ error: "reserve not found" });
      if (new Date(reserve.expires_at) < new Date()) return res.status(400).json({ error: "reserve expired — 90d validity" });
      if (total > reserve.remaining) {
        const a = audit("checkout_blocked_exceeds_reserve", { items, total, reserve_id }, { error: "exceeds remaining", reserve }, { bounded_check: `exceeds reserve remaining ${reserve.remaining/100}`, consent: false });
        const fallback = await createPaymentLink({ amount: total, currency: "INR", description: `Fallback: ${details.map(d=>d.name).join(", ")}`, customer: { name: customer.name || "Test User", contact: customer.contact || "+919999999999", email: customer.email || "test@razorpay" }, notes: { fallback_reason: "reserve_exceeded", audit_id: a.id } });
        return res.status(400).json({ error: `Bounded check failed: total ${total/100} > reserve remaining ${reserve.remaining/100}`, audit: a, fallback, explainability: "Graceful fallback to Standard Payment Link (not Reserve debit) — bounded, gated, audit trail preserved" });
      }
    }
    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder({ amount: total, currency: "INR", receipt, notes: { reserve_id: reserve_id || "", items: JSON.stringify(items) } });
    const localId = nextId("ord");
    const record = { id: localId, razorpay_order_id: order.id, amount: total, currency: "INR", receipt, items: details, explainability: { why: `Cart ${details.map(d=>d.name+"x"+d.qty).join(", ")}`, bounded_check, consent: !!reserve_id ? `reserve ${reserve_id} pre-auth` : "direct checkout consent", amount_inr: total/100 }, status: "created", created_at: new Date().toISOString(), razorpay_raw: order };
    orders.set(localId, record);
    if (reserve) {
      reserve.remaining -= total;
      debits.push({ id: nextId("dbt"), reserve_id, order_id: localId, amount: total, reason: "agent_checkout", status: "debited", created_at: new Date().toISOString() });
    }
    const a = audit("checkout_create", { items, reserve_id }, record, { bounded_check, consent });
    res.json({ order: record, checkout_url: `https://checkout.razorpay.com/v1/checkout.js?order_id=${order.id}`, audit: a, next_step: "Customer pays via Checkout with success@razorpay (test) -> webhook payment.captured -> settlement" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/webhook/razorpay", (req, res) => {
  const sig = req.headers["x-razorpay-signature"] || "";
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (secret && !secret.includes("xxx")) {
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (expected !== sig) return res.status(400).json({ error: "invalid signature" });
  }
  const evt = req.body.event || "payment.captured";
  const a = audit("webhook", req.body, { event: evt, verified: true });
  if (evt.includes("payment")) {
    const payment = req.body.payload?.payment?.entity || req.body;
    for (const o of orders.values()) if (o.razorpay_order_id === payment.order_id) o.status = "paid";
  }
  res.json({ ok: true, audit: a });
});

app.get("/api/audit", (req, res) => res.json({ count: audits.length, audits: audits.slice(-50) }));
app.get("/api/orders", (req, res) => res.json({ count: orders.size, orders: [...orders.values()] }));
app.get("/api/reserves", (req, res) => res.json({ count: reserves.size, reserves: [...reserves.values()] }));
app.get("/api/debits", (req, res) => res.json({ count: debits.length, debits }));
app.post("/api/test/reset", (req, res) => { resetStore(); res.json({ ok: true }); });

function sendLlmsTxt(req, res) {
  const maxReserve = RESERVE_MAX / 100;
  const catLines = Object.entries(categoriesData).map(([cat, n]) => `  - ${cat}: ${n} items`).join("\n");
  res.type("text/plain").send(`# AgentCart — AI Agent Commerce API
# A Razorpay-powered food ordering API designed for autonomous AI agents.
# Browse products, create reserves, checkout, and receive webhook confirmations.

## Authentication
No API key required for demo mode. All endpoints are open for testing.

## API Reference

### Catalog
  GET /api/catalog?limit=50&offset=0&q=&category=&price_min=&price_max=
    - Paginated product listing. Default limit=50, max=200.
    - Response: { count, total, offset, limit, products }
    - Products include price_inr (rupees) alongside price (paise).
  GET /api/catalog/:id
    - Single product detail by id (p1..p10).

### Reserves (Bounded Pre-auth)
  POST /api/reserve/create  { max_block_inr, user_phone, consent: true }
    - Creates a fund reserve (max block Rs ${maxReserve}).
    - Response: { reserve: { id, remaining, expires_at }, audit, explainability }
  GET /api/reserve/:id
    - Check reserve status and remaining balance.

### Checkout
  POST /api/checkout/create  { items: [{id, qty}], reserve_id?, customer? }
    - Creates Razorpay order and debits reserve if linked.
    - Response: { order, checkout_url, audit, next_step }

### Webhooks
  POST /api/webhook/razorpay  (Razorpay payload)
    - Handles payment.captured events. Verifies HMAC signature.

### Debug
  GET /api/audit          - Recent audit trail (last 50)
  GET /api/orders         - All orders
  GET /api/reserves       - All reserves
  GET /api/debits         - All reserve debits
  POST /api/test/reset    - Reset all in-memory state

## Featured Products (by stock)
  p7  Tandoor Roti (per pc)     Rs25   stock 300
  p10 Cold Coffee Mocktail      Rs80   stock 200
  p5  Pav Bhaji (Amul)          Rs120  stock 150
  p3  Veg Biryani               Rs199  stock 120
  p1  Paneer Butter Masala      Rs280  stock 100

## Categories
${catLines}

## Pagination
  The catalog supports limit and offset query params.
  Example: GET /api/catalog?limit=5&offset=0 (first 5 items)
           GET /api/catalog?limit=5&offset=5 (next 5 items)
  Response includes "total" for the full filtered count.

## Checkout Flow
  1. POST /api/reserve/create with { max_block_inr: <amount>, consent: true }
  2. POST /api/checkout/create with { items: [{id:"p5",qty:2}], reserve_id: "<rsv_id>" }
  3. Customer pays via checkout_url (Checkout.js with success@razorpay test)
  4. Razorpay fires webhook to POST /api/webhook/razorpay
  5. Order status updates to "paid"

## Test Credentials
  UPI ID: success@razorpay (succeeds) / failure@razorpay (fails)
  Phone:  9999999999 (default test)
  Mode:   mock (no real Razorpay key needed)
  Max reserve: Rs ${maxReserve}
  Reserve validity: 90 days
`);
}
app.get("/llms.txt", sendLlmsTxt);
app.get("/llm.txt", sendLlmsTxt);
app.get("/.well-known/llms.txt", sendLlmsTxt);

app.get("/", (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  const body = { name: "AgentCart API", docs: ["/health","/api/catalog","/llms.txt","/api/reserve/create","/api/checkout/create","/api/webhook/razorpay"] };
  if (req.query.debug === "1") body.mode = mode;
  res.json(body);
});

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g,'/')}` || process.argv[1]?.endsWith('index.js')) {
  app.listen(PORT, () => console.log(`AgentCart server listening http://localhost:${PORT} mode=${getMode()}`));
}
export default app;

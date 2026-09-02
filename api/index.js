import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { listCatalog, getProduct, calcTotal } from "./catalog.js";
import { reserves, orders, debits, audits, nextId, audit, resetStore } from "./store.js";
import { createOrder, createPaymentLink, getRazorpay } from "./razorpay.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RESERVE_MAX = parseInt(process.env.RESERVE_MAX_BLOCK || "10000", 10) * 100; // paise
const RESERVE_DAYS = parseInt(process.env.RESERVE_VALID_DAYS || "90", 10);

// Health
app.get("/health", (req, res) => res.json({ ok: true, mock: !getRazorpay(), reserve_max_paise: RESERVE_MAX, time: new Date().toISOString() }));
app.get("/api/catalog", (req, res) => {
  const { q, price_min, price_max, category } = req.query;
  const r = listCatalog({ query: q, price_min: price_min ? Number(price_min) : null, price_max: price_max ? Number(price_max) : null, category });
  res.json({ count: r.length, products: r.map(p => ({ ...p, price_inr: p.price / 100 })) });
});
app.get("/api/catalog/:id", (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});

// Create Reserve — SBMD 1 block -> N debits
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

// Create agent checkout — bounded + explainable
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
        // graceful fallback: create payment link instead
        const fallback = await createPaymentLink({ amount: total, currency: "INR", description: `Fallback: ${details.map(d=>d.name).join(", ")}`, customer: { name: customer.name || "Test User", contact: customer.contact || "+919999999999", email: customer.email || "test@razorpay" }, notes: { fallback_reason: "reserve_exceeded", audit_id: a.id } });
        return res.status(400).json({ error: `Bounded check failed: total ${total/100} > reserve remaining ${reserve.remaining/100}`, audit: a, fallback, explainability: "Graceful fallback to Standard Payment Link (not Reserve debit) — bounded, gated, audit trail preserved" });
      }
    }
    // create Razorpay order (bounded amount = total, tamper-proof via order_id)
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
  // update order if payment.captured
  if (evt.includes("payment")) {
    const payment = req.body.payload?.payment?.entity || req.body;
    // find order by razorpay_order_id
    for (const o of orders.values()) if (o.razorpay_order_id === payment.order_id) o.status = "paid";
  }
  res.json({ ok: true, audit: a });
});

app.get("/api/audit", (req, res) => res.json({ count: audits.length, audits: audits.slice(-50) }));
app.get("/api/orders", (req, res) => res.json({ count: orders.size, orders: [...orders.values()] }));
app.get("/api/reserves", (req, res) => res.json({ count: reserves.size, reserves: [...reserves.values()] }));
app.get("/api/debits", (req, res) => res.json({ count: debits.length, debits }));
app.post("/api/test/reset", (req, res) => { resetStore(); res.json({ ok: true }); });

// llms.txt agent-readable
app.get("/llms.txt", (req, res) => {
  res.type("text/plain").send(`# AgentCart catalog — agent-readable
# Use GET /api/catalog?q=&price_max=  then POST /api/checkout/create with {items:[{id,qty}], reserve_id}
# Bounded: max reserve Rs ${RESERVE_MAX/100}, token 90d, every debit gated by remaining + consent
# Test UPI: success@razorpay / failure@razorpay via Checkout.js
${listCatalog().map(p=> `- ${p.id}: ${p.name} Rs${p.price/100} stock ${p.stock} category ${p.category}`).join("\n")}
`);
});

app.get("/", (req, res) => res.json({ name: "AgentCart API", docs: ["/health","/api/catalog","/llms.txt","/api/reserve/create","/api/checkout/create","/api/webhook/razorpay"], mock: !getRazorpay() }));

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g,'/')}` || process.argv[1]?.endsWith('index.js')) {
  app.listen(PORT, () => console.log(`AgentCart server listening http://localhost:${PORT} mock=${!getRazorpay()}`));
}
export default app;

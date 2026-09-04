import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { listCatalog, getProduct, calcTotal, categoriesData } from "./catalog.js";
import { createOrder, createPaymentLink, getRazorpay, getMode } from "./razorpay.js";
import {
  insertOrder, getOrder, getOrderByRazorpayId, getAllOrders, updateOrder,
  insertReserve, getReserve, getAllReserves, updateReserve,
  insertDebit, getAllDebits,
  audit, getAudit,
  logActivity, getAgentActivities, getAgentDashboard,
  createSession, getSession,
  resetAll, nextId
} from "./db.js";
import {
  CheckoutSchema, ReserveSchema, ActivityLogSchema, AgentLoginSchema, validate
} from "./validation.js";

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const app = express();

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000").split(",");
app.use(cors({ origin: (origin, cb) => { if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true); else cb(new Error("CORS")); }, credentials: true }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; }, limit: "1mb" }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited" } });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited" } });

const PORT = process.env.PORT || 3001;
const RESERVE_MAX = parseInt(process.env.RESERVE_MAX_BLOCK || "10000", 10) * 100;
const RESERVE_DAYS = parseInt(process.env.RESERVE_VALID_DAYS || "90", 10);
const AGENT_KEYS = new Set((process.env.AGENT_KEYS || "").split(",").map(k => k.trim()).filter(Boolean));

function requireAgentKey(req, res, next) {
  const key = req.headers["x-agent-key"] || "";
  if (!AGENT_KEYS.has(key)) {
    audit("unauthorized_agent_call", { path: req.path }, { error: "unauthorized" });
    return res.status(401).json({ error: "unauthorized" });
  }
  req.agentKey = key;
  next();
}

function requireSession(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "no_token" });
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: "invalid_token" });
  if (new Date(session.expires_at) < new Date()) return res.status(401).json({ error: "token_expired" });
  req.agentKey = session.agent_key;
  next();
}

// ── Health ──
app.get("/health", apiLimiter, (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  res.json({ ok: true, mode, reserve_max_paise: RESERVE_MAX, time: new Date().toISOString() });
});
app.get("/api/health", apiLimiter, (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  res.json({ ok: true, mode, reserve_max_paise: RESERVE_MAX, time: new Date().toISOString() });
});

// ── Catalog ──
app.get("/api/catalog", apiLimiter, (req, res) => {
  const { q, price_min, price_max, category } = req.query;
  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;
  const result = listCatalog({ query: q, price_min: price_min ? Number(price_min) : null, price_max: price_max ? Number(price_max) : null, category, limit, offset });
  const products = result.products.map(p => ({ ...p, price_inr: p.price / 100 }));
  res.json({ count: result.count, total: result.total, offset: result.offset, limit: result.limit, products });
});

app.get("/api/catalog/:id", apiLimiter, (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ ...p, price_inr: p.price / 100 });
});

// ── Reserve ──
app.post("/api/reserve/create", requireAgentKey, writeLimiter, validate(ReserveSchema), (req, res) => {
  const { user_phone, max_block_inr } = req.validated;
  const amountPaise = Math.round((max_block_inr || 10000) * 100);
  if (amountPaise > RESERVE_MAX) {
    const a = audit("reserve_create_blocked", { max_block_inr }, { error: `exceeds max ${RESERVE_MAX / 100}` }, { bounded_check: `max ${RESERVE_MAX / 100} INR`, consent: false });
    return res.status(400).json({ error: `Bounded check failed: max block is Rs ${RESERVE_MAX / 100}`, audit: a });
  }
  const id = nextId("rsv");
  const now = new Date().toISOString();
  const expires_at = new Date(Date.now() + RESERVE_DAYS * 24 * 3600 * 1000).toISOString();
  const record = { id, user_phone, max_block: amountPaise, remaining: amountPaise, created_at: now, expires_at, consent_txn_id: `consent_${Date.now()}`, status: "active" };
  insertReserve(record);
  logActivity(req.agentKey, "reserve_create", { id, amount: amountPaise, phone: user_phone });
  const a = audit("reserve_create", { max_block_inr, user_phone }, record, { bounded_check: `within ${RESERVE_MAX / 100}`, consent: true });
  res.json({ reserve: record, audit: a, explainability: `Funds blocked Rs ${amountPaise / 100}, debits allowed until ${expires_at} within limit, revocable in UPI app` });
});

app.get("/api/reserve/:id", apiLimiter, (req, res) => {
  const r = getReserve(req.params.id);
  if (!r) return res.status(404).json({ error: "reserve not found" });
  res.json(r);
});

// ── Checkout ──
app.post("/api/checkout/create", requireAgentKey, writeLimiter, validate(CheckoutSchema), async (req, res) => {
  try {
    const { items, reserve_id, customer = {} } = req.validated;
    const { total, details } = calcTotal(items);
    let bounded_check = `total Rs ${total / 100} within stock & price bounds`;
    let consent = true;
    let reserve = null;
    if (reserve_id) {
      reserve = getReserve(reserve_id);
      if (!reserve) return res.status(404).json({ error: "reserve not found" });
      if (new Date(reserve.expires_at) < new Date()) return res.status(400).json({ error: "reserve expired — 90d validity" });
      if (total > reserve.remaining) {
        const a = audit("checkout_blocked_exceeds_reserve", { items, total, reserve_id }, { error: "exceeds remaining" }, { bounded_check: `exceeds reserve remaining ${reserve.remaining / 100}`, consent: false });
        const fallback = await createPaymentLink({ amount: total, currency: "INR", description: `Fallback: ${details.map(d => d.name).join(", ")}`, customer: { name: customer.name || "Test User", contact: customer.contact || "+919999999999", email: customer.email || "test@razorpay" }, notes: { fallback_reason: "reserve_exceeded", audit_id: a.id } });
        return res.status(400).json({ error: `Bounded check failed: total ${total / 100} > reserve remaining ${reserve.remaining / 100}`, audit: a, fallback, explainability: "Graceful fallback to Standard Payment Link" });
      }
    }
    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder({ amount: total, currency: "INR", receipt, notes: { reserve_id: reserve_id || "", items: JSON.stringify(items) } });
    const localId = nextId("ord");
    const record = { id: localId, razorpay_order_id: order.id, amount: total, currency: "INR", receipt, items: details, reserve_id: reserve_id || null, explainability: { why: `Cart ${details.map(d => d.name + "x" + d.qty).join(", ")}`, bounded_check, consent: !!reserve_id ? `reserve ${reserve_id} pre-auth` : "direct checkout consent", amount_inr: total / 100 }, status: "created", created_at: new Date().toISOString() };
    insertOrder(record);
    if (reserve) {
      updateReserve(reserve.id, { remaining: reserve.remaining - total });
      insertDebit({ id: nextId("dbt"), reserve_id, order_id: localId, amount: total, reason: "agent_checkout", status: "debited", created_at: new Date().toISOString() });
    }
    logActivity(req.agentKey, "checkout_create", { id: localId, amount: total, items: details.map(d => d.name) });
    const a = audit("checkout_create", { items, reserve_id }, record, { bounded_check, consent });
    res.json({ order: record, audit: a });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Public Checkout (no agent key) ──
app.post("/api/orders/create", writeLimiter, async (req, res) => {
  try {
    const { items, customer = {} } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items [{id, qty}] required" });
    const { total, details } = calcTotal(items);
    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder({ amount: total, currency: "INR", receipt, notes: { items: JSON.stringify(items) } });
    const localId = nextId("ord");
    const record = { id: localId, razorpay_order_id: order.id, amount: total, currency: "INR", receipt, items: details, reserve_id: null, explainability: { why: `Cart ${details.map(d => d.name + "x" + d.qty).join(", ")}`, bounded_check: `total Rs ${total / 100}`, consent: "direct checkout", amount_inr: total / 100 }, status: "created", created_at: new Date().toISOString() };
    insertOrder(record);
    audit("public_checkout_create", { items }, record);
    res.json({ order: record });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Webhook ──
app.post("/api/webhook", writeLimiter, (req, res) => {
  const sig = req.headers["x-razorpay-signature"] || "";
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (secret && secret !== "whsec_test_dummy") {
    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected !== sig) {
      audit("webhook_signature_invalid", { sig }, { error: "HMAC mismatch" });
      return res.status(400).json({ error: "invalid signature" });
    }
  }
  const evt = req.body.event || "unknown";
  const payment = req.body.payload?.payment?.entity || {};
  const matchedOrder = getOrderByRazorpayId(payment.order_id);
  if (matchedOrder && evt === "payment.captured") {
    updateOrder(matchedOrder.id, { status: "paid", payment_id: payment.id, paid_at: new Date().toISOString() });
    if (matchedOrder.reserve_id) {
      const r = getReserve(matchedOrder.reserve_id);
      if (r) insertDebit({ id: nextId("dbt"), reserve_id: matchedOrder.reserve_id, order_id: matchedOrder.id, amount: matchedOrder.amount, reason: "webhook_payment_captured", status: "released", created_at: new Date().toISOString() });
    }
    audit("webhook_payment_captured", { event: evt, order_id: matchedOrder.id, payment_id: payment.id }, matchedOrder);
  } else if (matchedOrder && evt === "payment.failed") {
    updateOrder(matchedOrder.id, { status: "failed", failure_reason: payment.error_description || "unknown", payment_id: payment.id });
    audit("webhook_payment_failed", { event: evt, order_id: matchedOrder.id }, matchedOrder);
  } else if (matchedOrder && evt === "payment.authorized") {
    updateOrder(matchedOrder.id, { status: "authorized", payment_id: payment.id });
    audit("webhook_payment_authorized", { event: evt, order_id: matchedOrder.id }, matchedOrder);
  } else {
    audit("webhook_unhandled", { event: evt, order_id: payment.order_id || null }, { payload_id: req.body.id || null });
  }
  res.json({ ok: true, event: evt });
});

app.post("/api/webhook/razorpay", (req, res) => {
  req.url = "/api/webhook";
  req.baseUrl = "";
  app.handle(req, res);
});

// ── Agent Dashboard ──
app.post("/api/agent/login", writeLimiter, validate(AgentLoginSchema), (req, res) => {
  const { agent_key } = req.validated;
  if (!AGENT_KEYS.has(agent_key)) return res.status(401).json({ error: "invalid agent key" });
  const session = createSession(agent_key);
  logActivity(agent_key, "agent_login", { session_id: session.id });
  res.json({ token: session.id, expires_at: session.expires_at, agent_key });
});

app.get("/api/agent/activities", requireSession, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const activities = getAgentActivities(req.agentKey, limit);
  res.json({ agent_key: req.agentKey, count: activities.length, activities });
});

app.post("/api/agent/log", requireSession, validate(ActivityLogSchema), (req, res) => {
  const { type, data, status } = req.validated;
  const entry = logActivity(req.agentKey, type, data, status);
  res.json({ ok: true, activity: entry });
});

app.get("/api/agent/dashboard", requireSession, (req, res) => {
  const dashboard = getAgentDashboard(req.agentKey);
  res.json(dashboard);
});

// ── Orders/Reserves/Debits/Audit (read) ──
app.get("/api/orders/:id", apiLimiter, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: "order not found" });
  res.json(o);
});

app.get("/api/orders", apiLimiter, (req, res) => {
  const orders = getAllOrders();
  res.json({ count: orders.length, orders });
});

app.get("/api/reserves", apiLimiter, (req, res) => {
  const reserves = getAllReserves();
  res.json({ count: reserves.length, reserves });
});

app.get("/api/debits", apiLimiter, (req, res) => {
  const debits = getAllDebits();
  res.json({ count: debits.length, debits });
});

app.get("/api/audit", apiLimiter, (req, res) => {
  const audits = getAudit(50);
  res.json({ count: audits.length, audits });
});

app.post("/api/test/reset", writeLimiter, (req, res) => { resetAll(); res.json({ ok: true }); });

// ── llms.txt ──
function sendLlmsTxt(req, res) {
  const maxReserve = RESERVE_MAX / 100;
  const catLines = Object.entries(categoriesData).map(([cat, n]) => `  - ${cat}: ${n} items`).join("\n");
  res.type("text/plain").send(`# AgentCart — AI Agent Commerce API
# A Razorpay-powered food ordering API for autonomous AI agents.
# Auth: POST /api/reserve/create, /api/checkout/create require X-Agent-Key: agent_demo_key_123
# Public: GET /api/catalog, /api/orders, /api/health, /llms.txt
# Dashboard: POST /api/agent/login -> GET /api/agent/dashboard (Bearer token)

## API Reference
  GET  /api/catalog             - List products (q, category, price_min, price_max, limit, offset)
  GET  /api/catalog/:id         - Single product
  POST /api/reserve/create      - Create bounded reserve (X-Agent-Key)
  POST /api/checkout/create     - Create Razorpay order (X-Agent-Key)
  POST /api/orders/create       - Public checkout (no key)
  POST /api/webhook             - Razorpay webhook
  GET  /api/orders              - All orders
  GET  /api/orders/:id          - Single order
  POST /api/agent/login         - Get dashboard token
  GET  /api/agent/dashboard     - Agent KPIs + orders + activities (Bearer token)
  GET  /api/agent/activities    - Agent activity feed (Bearer token)

## Products
${listCatalog().products.map(p => `  ${p.id}  ${p.name}  Rs${p.price / 100}  stock ${p.stock}`).join("\n")}

## Categories
${catLines}

## Checkout Flow
  1. POST /api/reserve/create { max_block_inr: 500, consent: true } + X-Agent-Key
  2. POST /api/checkout/create { items: [{id:"p5",qty:2}], reserve_id } + X-Agent-Key
  3. Customer pays via Checkout.js (success@razorpay test)
  4. Webhook confirms: payment.captured → paid
`);
}
app.get("/llms.txt", sendLlmsTxt);
app.get("/llm.txt", sendLlmsTxt);
app.get("/.well-known/llms.txt", sendLlmsTxt);

// ── Root ──
app.get("/", (req, res) => {
  const mode = getMode();
  res.set("X-Razorpay-Mode", mode);
  res.json({ name: "AgentCart API", docs: ["/health", "/api/catalog", "/llms.txt", "/api/reserve/create", "/api/checkout/create", "/api/orders/create", "/api/webhook"], mode });
});

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.js')) {
  app.listen(PORT, () => console.log(`AgentCart server listening http://localhost:${PORT} mode=${getMode()}`));
}
export default app;

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { listCatalog, getProduct, calcTotal, categoriesData } from "./catalog.js";
import {
  createMerchant, getMerchant, listMerchants, addHostedProduct,
  getMerchantCatalog, getMerchantProduct, calcMerchantTotal,
} from "./merchants.js";
import { createOrder, createPaymentLink, getRazorpay, getMode } from "./razorpay.js";
import pool, {
  initDB,
  insertOrder, getOrder, getOrderByRazorpayId, getAllOrders, updateOrder,
  insertReserve, getReserve, getAllReserves, updateReserve,
  insertDebit, getAllDebits,
  audit, getAudit,
  logActivity, getAgentActivities, getAgentDashboard,
  createSession, getSession, getActiveSession,
  checkIdempotency, storeIdempotency,
  resetAll, nextId,
  getSessionSummary
} from "./db.js";
import {
  CheckoutSchema, ReserveSchema, ApproveCheckoutSchema, ActivityLogSchema, validate,
  MerchantSchema, HostedProductSchema, MerchantCheckoutSchema,
} from "./validation.js";

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const app = express();

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000").split(",");
app.use(cors({ origin: (origin, cb) => { if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true); else cb(new Error("CORS")); }, credentials: true }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; }, limit: "1mb" }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited" }, skip: () => process.env.NODE_ENV === "test" });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited" }, skip: () => process.env.NODE_ENV === "test" });

const PORT = process.env.PORT || 3001;
const RESERVE_MAX = parseInt(process.env.RESERVE_MAX_BLOCK || "10000", 10) * 100;
const RESERVE_DAYS = parseInt(process.env.RESERVE_VALID_DAYS || "90", 10);

// Standardized error response helper (PRD-compliant: { error, code })
function err(res, status, message, code) {
  return res.status(status).json({ error: message, code });
}

// ── HMAC Agent Auth ──
// Parse AGENT_SECRETS from .env: "agent1:secret1,agent2:secret2"
// Each agent has a unique secret. Requests are signed per-request (no static key in headers).
const AGENT_SECRETS = new Map();
for (const pair of (process.env.AGENT_SECRETS || "").split(",").map(s => s.trim()).filter(Boolean)) {
  const [id, secret] = pair.split(":");
  if (id && secret) AGENT_SECRETS.set(id, secret);
}
const HMAC_TIMESTAMP_TOLERANCE_MS = 60_000; // 60 seconds
const usedNonces = new Map(); // nonce → timestamp, for replay protection
const NONCE_CLEANUP_INTERVAL_MS = 120_000;
setInterval(() => {
  const cutoff = Date.now() - HMAC_TIMESTAMP_TOLERANCE_MS;
  for (const [nonce, ts] of usedNonces) { if (ts < cutoff) usedNonces.delete(nonce); }
}, NONCE_CLEANUP_INTERVAL_MS);

async function verifyHmac(req, res, next) {
  try {
    const agentId = req.headers["x-agent-id"];
    const nonce = req.headers["x-nonce"];
    const timestamp = req.headers["x-timestamp"];
    const signature = req.headers["x-signature"];

    if (!agentId || !nonce || !timestamp || !signature) {
      await audit("auth_unknown_agent", { agentId, path: req.path }, { error: "missing_auth_headers", required: ["x-agent-id", "x-nonce", "x-timestamp", "x-signature"] });
      return err(res, 401, "Missing authentication headers", "MISSING_AUTH_HEADERS");
    }

    const secret = AGENT_SECRETS.get(agentId);
    if (!secret) {
      await audit("auth_unknown_agent", { agentId, path: req.path }, { error: "unknown agent" });
      return err(res, 401, "Unknown agent", "UNKNOWN_AGENT");
    }

    const tsRaw = parseInt(timestamp, 10);
    if (isNaN(tsRaw)) {
      await audit("auth_timestamp_invalid", { agentId, timestamp, path: req.path });
      return err(res, 401, "Invalid timestamp", "TIMESTAMP_INVALID");
    }
    const ts = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
    if (Math.abs(Date.now() - ts) > HMAC_TIMESTAMP_TOLERANCE_MS) {
      await audit("auth_timestamp_expired", { agentId, timestamp, path: req.path });
      return err(res, 401, "Timestamp expired", "TIMESTAMP_EXPIRED");
    }

    if (usedNonces.has(nonce)) {
      await audit("auth_nonce_reuse", { agentId, nonce, path: req.path });
      return err(res, 401, "Nonce already used", "NONCE_REUSED");
    }

    const body = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {});
    const payload = `${req.method}${req.path}${timestamp}${nonce}${body}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(signature, "hex");
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      await audit("auth_signature_invalid", { agentId, path: req.path }, { error: "HMAC mismatch" });
      return err(res, 401, "Invalid HMAC signature", "INVALID_SIGNATURE");
    }

    usedNonces.set(nonce, Date.now());
    req.agentKey = agentId;
    next();
  } catch (e) {
    next(e);
  }
}

async function requireSession(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return err(res, 401, "No token provided", "NO_TOKEN");
    const session = await getSession(token);
    if (!session) return err(res, 401, "Invalid token", "INVALID_TOKEN");
    if (new Date(session.expires_at) < new Date()) return err(res, 401, "Token expired", "TOKEN_EXPIRED");
    req.agentKey = session.agent_key;
    next();
  } catch (e) {
    next(e);
  }
}

// ── Short-lived human approval capability ──
// The agent (HMAC-authed) requests a capability to show an Approve button.
// The browser uses ONLY this capability (x-capability header), never the agent secret.
const capabilityStore = new Map(); // capability -> { reserveId, exp }
const CAPABILITY_TTL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [cap, meta] of capabilityStore) { if (meta.exp < now) capabilityStore.delete(cap); }
}, 60_000);

app.post("/api/approval/request-token", verifyHmac, writeLimiter, async (req, res) => {
  try {
    const reserveId = req.body?.reserve_id;
    if (!reserveId) return err(res, 400, "reserve_id required", "RESERVE_ID_REQUIRED");
    const reserve = await getReserve(reserveId);
    if (!reserve) return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
    if (reserve.agent_key && reserve.agent_key !== req.agentKey) {
      await audit("approval_capability_forbidden", { reserveId, agentKey: req.agentKey }, { error: "not the owning agent" });
      return err(res, 403, "Not the owning agent", "FORBIDDEN");
    }
    const capability = crypto.randomBytes(24).toString("hex");
    capabilityStore.set(capability, { reserveId, exp: Date.now() + CAPABILITY_TTL_MS });
    await audit("approval_capability_issued", { reserveId }, { ttl_ms: CAPABILITY_TTL_MS });
    res.json({ capability, expires_at: new Date(Date.now() + CAPABILITY_TTL_MS).toISOString() });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// Human PIN retrieval — delivers the one-time approval PIN to the human's approval
// session (capability-gated). This is the human out-of-band channel (in production this
// is an SMS/email OTP). The PIN is never returned by any agent-authenticated API
// (reserve/create excludes it); approve requires the human to type it.
app.post("/api/approval/pin", verifyCapability, writeLimiter, async (req, res) => {
  try {
    const reserveId = req.capability?.reserveId || req.body?.reserve_id;
    if (!reserveId) return err(res, 400, "reserve_id required", "RESERVE_ID_REQUIRED");
    const reserve = await getReserve(reserveId);
    if (!reserve) return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
    if (!reserve.human_pin) return err(res, 400, "No human PIN for reserve", "NO_HUMAN_PIN");
    await audit("approval_pin_delivered", { reserveId }, {}, { consent: true });
    res.json({ reserve_id: reserveId, human_pin: reserve.human_pin, pin_required: true });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// Frontend approve: authenticated via short-lived capability (no agent secret)
async function verifyCapability(req, res, next) {
  const cap = req.headers["x-capability"] || "";
  if (!cap) return err(res, 401, "Missing capability", "MISSING_CAPABILITY");
  const meta = capabilityStore.get(cap);
  if (!meta) return err(res, 401, "Invalid capability", "INVALID_CAPABILITY");
  if (meta.exp < Date.now()) { capabilityStore.delete(cap); return err(res, 401, "Capability expired", "CAPABILITY_EXPIRED"); }
  // Bind capability to the reserve being approved
  if (req.body?.reserve_id && meta.reserveId !== req.body.reserve_id) {
    return err(res, 403, "Capability reserve mismatch", "CAPABILITY_RESERVE_MISMATCH");
  }
  req.capability = meta;
  req.capabilityToken = cap;
  // Bind to the owning agent so downstream (logActivity) knows who triggered it
  const reserve = await getReserve(meta.reserveId);
  req.agentKey = reserve?.agent_key || "human";
  // Do not consume here: /api/approval/pin and /api/checkout/approve are two
  // separate browser calls in the PRD's HITL flow. The approve endpoint consumes it.
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
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = parseInt(req.query.offset, 10) || 0;
  const result = listCatalog({ query: q, price_min: price_min ? Number(price_min) : null, price_max: price_max ? Number(price_max) : null, category, limit, offset });
  const products = result.products.map(p => ({ ...p, price_inr: p.price / 100 }));
  res.json({ count: result.count, total: result.total, offset: result.offset, limit: result.limit, has_more: result.offset + result.count < result.total, products });
});

app.get("/api/catalog/:id", apiLimiter, (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return err(res, 404, "Product not found", "PRODUCT_NOT_FOUND");
  res.json({ ...p, price_inr: p.price / 100 });
});

// ── Merchants: dual-mode catalog (enterprise API vs local SMB hosting) ──
// POST /api/merchants { name, catalog_config: { mode, external_api_url? } }
app.post("/api/merchants", verifyHmac, writeLimiter, validate(MerchantSchema), async (req, res) => {
  try {
    const m = await createMerchant(req.validated);
    await audit("merchant_create", req.validated, m);
    res.json({ merchant: m });
  } catch (e) {
    return err(res, 400, e.message, "MERCHANT_CREATE_FAILED");
  }
});

app.get("/api/merchants", apiLimiter, async (req, res) => {
  const merchants = await listMerchants();
  res.json({ count: merchants.length, merchants });
});

app.get("/api/merchants/:id", apiLimiter, async (req, res) => {
  const m = await getMerchant(req.params.id);
  if (!m) return err(res, 404, "Merchant not found", "MERCHANT_NOT_FOUND");
  res.json({ merchant: m });
});

// Hosted catalog management (SMB mode only): POST products into our DB.
app.post("/api/merchants/:id/products", verifyHmac, writeLimiter, validate(HostedProductSchema), async (req, res) => {
  try {
    const p = await addHostedProduct(req.params.id, req.validated);
    await audit("merchant_hosted_product_upsert", { merchant_id: req.params.id, ...req.validated }, p);
    res.json({ product: { ...p, price_inr: p.price / 100 } });
  } catch (e) {
    const status = e.status || 400;
    return err(res, status, e.message, e.code || "HOSTED_PRODUCT_ERROR");
  }
});

// Dynamic router: hosted → local DB, external → HTTP on the fly (zero-data).
app.get("/api/merchants/:id/catalog", apiLimiter, async (req, res) => {
  try {
    const { q, price_min, price_max, category } = req.query;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = parseInt(req.query.offset, 10) || 0;
    const result = await getMerchantCatalog(req.params.id, { query: q, price_min, price_max, category, limit, offset });
    const products = result.products.map((p) => ({ ...p, price_inr: p.price / 100 }));
    res.json({
      count: result.count,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      has_more: result.offset + result.count < result.total,
      products
    });
  } catch (e) {
    const status = e.status || 500;
    return err(res, status, e.message, e.code || "EXTERNAL_CATALOG_ERROR");
  }
});

app.get("/api/merchants/:id/catalog/:productId", apiLimiter, async (req, res) => {
  try {
    const p = await getMerchantProduct(req.params.id, req.params.productId);
    if (!p) return err(res, 404, "Product not found", "PRODUCT_NOT_FOUND");
    res.json({ ...p, price_inr: p.price / 100 });
  } catch (e) {
    const status = e.status || 500;
    return err(res, status, e.message, e.code || "EXTERNAL_CATALOG_ERROR");
  }
});

// ── Reserve ──
app.post("/api/reserve/create", verifyHmac, writeLimiter, validate(ReserveSchema), async (req, res) => {
  try {
    const { user_phone, max_block_inr } = req.validated;
    const amountPaise = Math.round((max_block_inr || 10000) * 100);
    if (amountPaise > RESERVE_MAX) {
      const a = await audit("reserve_create_blocked", { max_block_inr }, { error: `exceeds max ${RESERVE_MAX / 100}` }, { bounded_check: `max ${RESERVE_MAX / 100} INR`, consent: false });
      return err(res, 400, `Bounded check failed: max block is Rs ${RESERVE_MAX / 100}`, "BUDGET_EXCEEDED");
    }
    const id = nextId("rsv");
    const now = new Date().toISOString();
    const expires_at = new Date(Date.now() + RESERVE_DAYS * 24 * 3600 * 1000).toISOString();
    const humanPin = String(crypto.randomInt(100000, 1000000));
    const humanPinHash = crypto.createHash("sha256").update("agentcart-pin:" + humanPin + ":" + id).digest("hex");
    const record = { id, user_phone, max_block: amountPaise, remaining: amountPaise, created_at: now, expires_at, consent_txn_id: `consent_${Date.now()}`, status: "pending_approval", approval_token: null, agent_key: req.agentKey, human_pin: humanPin, human_pin_hash: humanPinHash, human_pin_used: 0 };
    await insertReserve(record);
    await logActivity(req.agentKey, "reserve_create", { id, amount: amountPaise, phone: user_phone });
    const a = await audit("reserve_create", { max_block_inr, user_phone }, { ...record, approval_token: "(redacted)", human_pin: "(redacted)", human_pin_hash: "(hashed)" }, { bounded_check: `within ${RESERVE_MAX / 100}`, consent: true });
    const agentView = { ...record };
    delete agentView.approval_token; delete agentView.human_pin; delete agentView.human_pin_hash; delete agentView.human_pin_used;
    res.json({
      reserve: agentView,
      audit: a,
      approval_required: true,
      approval_url: `#/checkout?reserve_id=${id}`,
      explainability: `Funds blocked Rs ${amountPaise / 100}, debits allowed until ${expires_at} within limit, revocable in UPI app. Awaiting HUMAN approval — the calling agent cannot approve this itself.`
    });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/reserve/:id", apiLimiter, async (req, res) => {
  try {
    const r = await getReserve(req.params.id);
    if (!r) return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
    const { approval_token, ...safe } = r;
    res.json(safe);
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── Reserve Cancel ──
// Cancel a reserve and mark it as revoked. Does not restore stock (external merchant catalogs
// manage their own inventory). Records the cancellation for audit trail.
app.post("/api/reserve/:id/cancel", verifyHmac, writeLimiter, async (req, res) => {
  try {
    const reserveId = req.params.id;
    const reserve = await getReserve(reserveId);
    
    if (!reserve) {
      const a = await audit("reserve_cancel_not_found", { reserve_id: reserveId }, { error: "not found" });
      return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
    }
    
    // Only the owning agent can cancel
    if (reserve.agent_key && reserve.agent_key !== req.agentKey) {
      const a = await audit("reserve_cancel_forbidden", { reserve_id: reserveId, agent_key: req.agentKey }, { error: "not the owning agent" });
      return err(res, 403, "Not the owning agent", "FORBIDDEN");
    }
    
    // Check current status
    if (reserve.status === "cancelled") {
      const a = await audit("reserve_cancel_already_cancelled", { reserve_id: reserveId }, { status: reserve.status });
      return err(res, 400, "Reserve already cancelled", "ALREADY_CANCELLED");
    }
    
    if (reserve.status === "completed") {
      const a = await audit("reserve_cancel_already_completed", { reserve_id: reserveId }, { status: reserve.status });
      return err(res, 400, "Reserve already completed", "ALREADY_COMPLETED");
    }
    
    // Check expiry
    if (new Date(reserve.expires_at) < new Date()) {
      const a = await audit("reserve_cancel_expired", { reserve_id: reserveId }, { error: "reserve expired" });
      return err(res, 400, "Reserve expired", "RESERVE_EXPIRED");
    }
    
    // Perform cancellation with row-level lock for consistency
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query('SELECT * FROM reserves WHERE id = $1 FOR UPDATE', [reserveId]);
      const r = row.rows[0];
      if (!r) {
        await client.query('ROLLBACK');
        return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
      }
      if (r.status === "cancelled" || r.status === "completed") {
        await client.query('ROLLBACK');
        return err(res, 400, `Reserve already ${r.status}`, `ALREADY_${r.status.toUpperCase()}`);
      }
      await client.query('UPDATE reserves SET status = $1 WHERE id = $2', ['cancelled', reserveId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
    await logActivity(req.agentKey, "reserve_cancel", { id: reserveId, amount: reserve.remaining });
    const a = await audit("reserve_cancelled", { reserve_id: reserveId }, { remaining: reserve.remaining, status: "cancelled" });
    
    res.json({
      reserve_id: reserveId,
      status: "cancelled",
      message: "Reserve cancelled successfully. Remaining funds are no longer available for debits.",
      audit: a,
      explainability: `Reserve ${reserveId} cancelled by agent ${req.agentKey}. Remaining Rs ${reserve.remaining / 100} will not be debited.`
    });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── Checkout ──
// HITL Flow: reserve/create → approval_token → approve → Razorpay order
// /api/checkout/create now only prepares cart + validates reserve (no Razorpay hit)
// Supports optional merchant_id for dual-mode catalog routing:
//   merchant_id set → hosted DB or external API; unset → legacy global catalog.
app.post("/api/checkout/create", verifyHmac, writeLimiter, validate(MerchantCheckoutSchema), async (req, res) => {
  try {
    const { items, reserve_id, customer = {}, merchant_id } = req.validated;
    const { total, details } = merchant_id
      ? await calcMerchantTotal(merchant_id, items)
      : calcTotal(items);
    let bounded_check = `total Rs ${total / 100} within stock & price bounds`;
    let consent = true;
    let reserve = null;
    if (reserve_id) {
      reserve = await getReserve(reserve_id);
      if (!reserve) return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
      if (new Date(reserve.expires_at) < new Date()) return err(res, 400, "Reserve expired — 90d validity", "RESERVE_EXPIRED");
      if (total > reserve.remaining) {
        const a = await audit("checkout_blocked_exceeds_reserve", { items, total, reserve_id }, { error: "exceeds remaining" }, { bounded_check: `exceeds reserve remaining ${reserve.remaining / 100}`, consent: false });
        return err(res, 400, `Bounded check failed: total ${total / 100} > reserve remaining ${reserve.remaining / 100}`, "BUDGET_EXCEEDED");
      }
      // Store items in reserve for approval flow
      await updateReserve(reserve.id, { items: JSON.stringify(details) });
    }
    const localId = nextId("ord");
    const record = { id: localId, razorpay_order_id: null, amount: total, currency: "INR", receipt: `rcpt_${Date.now()}`, items: details, reserve_id: reserve_id || null, explainability: { why: `Cart ${details.map(d => d.name + "x" + d.qty).join(", ")}`, bounded_check, consent: !!reserve_id ? `reserve ${reserve_id} pre-auth` : "direct checkout consent", amount_inr: total / 100 }, agent_key: req.agentKey || null, status: "pending_approval", created_at: new Date().toISOString() };
    await insertOrder(record);
    await logActivity(req.agentKey, "checkout_prepare", { id: localId, amount: total, items: details.map(d => d.name) });
    const a = await audit("checkout_prepare", { items, reserve_id }, record, { bounded_check, consent });
    res.json({ order: record, audit: a, message: "Cart prepared. Awaiting human approval to execute payment via /api/checkout/approve.", next_step: "User clicks Approve → POST /api/checkout/approve with reserve_id, approval_token, idempotency_key" });
  } catch (e) {
    return err(res, 500, e.message, "INTERNAL_ERROR");
  }
});

// ── HITL Approve Checkout ──
// Human clicks "Approve" → this endpoint validates a short-lived capability (the human's
// approval session) + the human-held one-time PIN, then creates the Razorpay order.
// The agent alone can never satisfy this: it never receives the PIN from reserve/create.
app.post("/api/checkout/approve", verifyCapability, writeLimiter, validate(ApproveCheckoutSchema), async (req, res) => {
  try {
    const { reserve_id, idempotency_key } = req.validated;
    // `human_pin` may come from body or as `approval_token` (legacy alias)
    const human_pin = req.validated.human_pin || req.body.human_pin || req.body.approval_token;

    // Idempotency check: return cached response if key already used
    const cached = await checkIdempotency(idempotency_key);
    if (cached) {
      await audit("checkout_approve_idempotent", { reserve_id, idempotency_key }, cached);
      return res.json({ ...cached, idempotent: true });
    }

    // Validate reserve exists
    const reserve = await getReserve(reserve_id);
    if (!reserve) return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND");
    if (reserve.status === "approved" || reserve.status === "completed") {
      return err(res, 400, "Reserve already approved/completed", "RESERVE_ALREADY_APPROVED");
    }
    if (reserve.status === "cancelled") {
      return err(res, 400, "Reserve was cancelled", "RESERVE_CANCELLED");
    }
    if (new Date(reserve.expires_at) < new Date()) {
      return err(res, 400, "Reserve expired — 90d validity", "RESERVE_EXPIRED");
    }

    // Validate the human-held PIN (HITL guardrail): timing-safe compare against the
    // stored salted hash, and consume it after first use.
    if (reserve.human_pin_used) {
      await audit("checkout_approve_pin_already_used", { reserve_id });
      return err(res, 403, "Approval PIN already used", "PIN_ALREADY_USED");
    }
    if (!reserve.human_pin_hash) {
      await audit("checkout_approve_no_pin", { reserve_id });
      return err(res, 403, "No approval PIN — human approval not verified", "NO_PIN");
    }
    const expected = crypto.createHash("sha256").update("agentcart-pin:" + human_pin + ":" + reserve.id).digest("hex");
    const provided = reserve.human_pin_hash;
    const ok = expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
    if (!ok) {
      await audit("checkout_approve_pin_mismatch", { reserve_id }, { error: "invalid human PIN" });
      return err(res, 403, "Invalid approval PIN — human approval not verified", "INVALID_PIN");
    }

    // Parse stored items from reserve (set during checkout/create)
    const storedItems = reserve.items ? JSON.parse(reserve.items) : [];
    if (!storedItems.length) {
      return err(res, 400, "No items stored in reserve — call /api/checkout/create first", "NO_ITEMS_IN_RESERVE");
    }

    const total = storedItems.reduce((sum, item) => sum + (item.line || item.price * item.qty), 0);

    // Bounded check: total must not exceed reserve remaining
    if (total > reserve.remaining) {
      const a = await audit("checkout_approve_blocked", { reserve_id, total }, { error: "exceeds remaining" }, { bounded_check: `exceeds reserve remaining ${reserve.remaining / 100}`, consent: false });
      return err(res, 400, `Bounded check failed: total ${total / 100} > reserve remaining ${reserve.remaining / 100}`, "BUDGET_EXCEEDED");
    }

    // Create actual Razorpay Order (before transaction, so a failure touches nothing)
    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder({ amount: total, currency: "INR", receipt, notes: { reserve_id, idempotency_key, items: JSON.stringify(storedItems.map(d => ({ id: d.id, qty: d.qty }))) } });

    // Transaction: lock the reserve, debit it, insert order + debit atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reserveRow = await client.query('SELECT * FROM reserves WHERE id = $1 FOR UPDATE', [reserve_id]);
      const reserve = reserveRow.rows[0] || null;
      if (!reserve) { await client.query('ROLLBACK'); return err(res, 404, "Reserve not found", "RESERVE_NOT_FOUND"); }
      if (reserve.status === "approved" || reserve.status === "completed") { await client.query('ROLLBACK'); return err(res, 400, "Reserve already approved/completed", "RESERVE_ALREADY_APPROVED"); }
      if (reserve.status === "cancelled") { await client.query('ROLLBACK'); return err(res, 400, "Reserve was cancelled", "RESERVE_CANCELLED"); }
      if (new Date(reserve.expires_at) < new Date()) { await client.query('ROLLBACK'); return err(res, 400, "Reserve expired — 90d validity", "RESERVE_EXPIRED"); }
      if (reserve.human_pin_used) { await client.query('ROLLBACK'); return err(res, 403, "Approval PIN already used", "PIN_ALREADY_USED"); }
      if (!reserve.human_pin_hash) { await client.query('ROLLBACK'); return err(res, 403, "No approval PIN — human approval not verified", "NO_PIN"); }
      const expected = crypto.createHash("sha256").update("agentcart-pin:" + human_pin + ":" + reserve.id).digest("hex");
      const provided = reserve.human_pin_hash;
      const ok = expected.length === provided.length && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
      if (!ok) { await client.query('ROLLBACK'); return err(res, 403, "Invalid approval PIN — human approval not verified", "INVALID_PIN"); }
      if (total > reserve.remaining) { await client.query('ROLLBACK'); return err(res, 400, `Bounded check failed: total ${total / 100} > reserve remaining ${reserve.remaining / 100}`, "BUDGET_EXCEEDED"); }
      await client.query('UPDATE reserves SET remaining = remaining - $1, status = $2, human_pin_used = 1 WHERE id = $3', [total, 'approved', reserve_id]);
      const localId = nextId("ord");
      const record = {
        id: localId, razorpay_order_id: order.id, amount: total, currency: "INR", receipt,
        items: storedItems, reserve_id,
        explainability: {
          why: `Approved cart: ${storedItems.map(d => d.name + "x" + d.qty).join(", ")}`,
          bounded_check: `total Rs ${total / 100} within reserve remaining ${reserve.remaining / 100}`,
          consent: `reserve ${reserve_id} human-approved via one-time PIN`,
          amount_inr: total / 100,
          human_pin_hash: reserve.human_pin_hash.slice(0, 16),
        },
        agent_key: req.agentKey || null,
        status: "created", created_at: new Date().toISOString()
      };
      await client.query('INSERT INTO orders (id, razorpay_order_id, amount, currency, receipt, items, reserve_id, explainability, agent_key, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [record.id, record.razorpay_order_id, record.amount, record.currency, record.receipt, JSON.stringify(record.items), record.reserve_id || null, JSON.stringify(record.explainability), record.agent_key || null, record.status, record.created_at]);
      await client.query('INSERT INTO debits (id, reserve_id, order_id, amount, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [nextId("dbt"), reserve_id, localId, total, "hitl_approved_checkout", "debited", new Date().toISOString()]);
      await client.query('COMMIT');
      await logActivity(req.agentKey, "checkout_approve", { id: localId, amount: total, reserve_id, items: storedItems.map(d => d.name) });
      const a = await audit("checkout_approve", { reserve_id, idempotency_key }, record, { bounded_check: `within reserve`, consent: true });
      const responsePayload = { order: record, audit: a };
      await storeIdempotency(idempotency_key, responsePayload);
      res.json(responsePayload);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── Public Checkout (customer-facing) ──
// Requires proof-of-work gate: client computes nonce where sha256(body+nonce) starts with 4 hex zeros (~65k tries).
// This adds a small client cost to prevent automated/scripted abuse without annoying real humans.
// Stricter per-IP rate limit on top.
const publicWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "rate_limited", code: "RATE_LIMITED" } });
const POW_DIFFICULTY = "0000";

app.post("/api/orders/create", publicWriteLimiter, async (req, res) => {
  try {
    const { items, customer = {}, pow } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) return err(res, 400, "Items required: [{id, qty}]", "VALIDATION_FAILED");
    if (!pow || typeof pow !== "string" || pow.length > 64) {
      return err(res, 422, "Proof of work required", "POW_REQUIRED");
    }
    const bodyForPow = JSON.stringify({ items, customer });
    const hash = crypto.createHash("sha256").update(bodyForPow + pow).digest("hex");
    if (!hash.startsWith(POW_DIFFICULTY)) {
      await audit("public_checkout_pow_invalid", { items }, { hash });
      return err(res, 422, "Invalid proof of work", "POW_INVALID");
    }
    const { total, details } = calcTotal(items);
    const receipt = `rcpt_${Date.now()}`;
    const order = await createOrder({ amount: total, currency: "INR", receipt, notes: { items: JSON.stringify(items) } });
    const localId = nextId("ord");
    const record = { id: localId, razorpay_order_id: order.id, amount: total, currency: "INR", receipt, items: details, reserve_id: null, explainability: { why: `Cart ${details.map(d => d.name + "x" + d.qty).join(", ")}`, bounded_check: `total Rs ${total / 100}`, consent: "public checkout", amount_inr: total / 100 }, status: "created", created_at: new Date().toISOString() };
    await insertOrder(record);
    await audit("public_checkout_create", { items }, record);
    res.json({ order: record });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── Webhook ──
app.post("/api/webhook", writeLimiter, async (req, res) => {
  try {
    const sig = req.headers["x-razorpay-signature"] || "";
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    if (!sig) {
      await audit("webhook_no_signature", {}, { error: "missing x-razorpay-signature" });
      return err(res, 401, "Missing signature", "MISSING_SIGNATURE");
    }
    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    const providedBuffer = Buffer.from(sig, "hex");
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      await audit("webhook_signature_invalid", { sig }, { error: "HMAC mismatch" });
      return err(res, 400, "Invalid signature", "WEBHOOK_SIGNATURE_INVALID");
    }
    const evt = req.body.event || "unknown";
    const payment = req.body.payload?.payment?.entity || {};
    const matchedOrder = await getOrderByRazorpayId(payment.order_id);

    const KNOWN_EVENTS = ["payment.captured", "payment.failed", "payment.authorized"];
    if (!KNOWN_EVENTS.includes(evt)) {
      await audit("webhook_rejected_unknown_event", { event: evt }, { error: "unknown event type" });
      return err(res, 400, "Unknown event", "UNKNOWN_EVENT");
    }

    if (matchedOrder && evt === "payment.captured") {
      await updateOrder(matchedOrder.id, { status: "paid", payment_id: payment.id, paid_at: new Date().toISOString() });
      if (matchedOrder.reserve_id) {
        const r = await getReserve(matchedOrder.reserve_id);
        if (r) await insertDebit({ id: nextId("dbt"), reserve_id: matchedOrder.reserve_id, order_id: matchedOrder.id, amount: matchedOrder.amount, reason: "webhook_payment_captured", status: "released", created_at: new Date().toISOString() });
      }
      await audit("webhook_payment_captured", { event: evt, order_id: matchedOrder.id, payment_id: payment.id }, matchedOrder);
    } else if (matchedOrder && evt === "payment.failed") {
      await updateOrder(matchedOrder.id, { status: "failed", failure_reason: payment.error_description || "unknown", payment_id: payment.id });
      await audit("webhook_payment_failed", { event: evt, order_id: matchedOrder.id }, matchedOrder);
    } else if (matchedOrder && evt === "payment.authorized") {
      await updateOrder(matchedOrder.id, { status: "authorized", payment_id: payment.id });
      await audit("webhook_payment_authorized", { event: evt, order_id: matchedOrder.id }, matchedOrder);
    } else {
      await audit("webhook_no_matching_order", { event: evt, order_id: payment.order_id || null }, { payload_id: req.body.id || null });
    }
    res.json({ ok: true, event: evt });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.post("/api/webhook/razorpay", (req, res) => {
  req.url = "/api/webhook";
  req.baseUrl = "";
  app.handle(req, res);
});

// ── Agent Dashboard ──
app.post("/api/agent/login", verifyHmac, writeLimiter, async (req, res) => {
  try {
    const existing = await getActiveSession(req.agentKey);
    const session = existing || await createSession(req.agentKey);
    const reused = !!existing;
    await logActivity(req.agentKey, "agent_login", { session_id: session.id, reused });
    res.json({ token: session.id, expires_at: session.expires_at, agent_key: req.agentKey, reused });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/agent/activities", requireSession, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 200);
    const activities = await getAgentActivities(req.agentKey, limit);
    res.json({ agent_key: req.agentKey, count: activities.length, activities });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.post("/api/agent/log", requireSession, validate(ActivityLogSchema), async (req, res) => {
  try {
    const { type, data, status } = req.validated;
    const entry = await logActivity(req.agentKey, type, data, status);
    res.json({ ok: true, activity: entry });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/agent/dashboard", requireSession, async (req, res) => {
  try {
    const dashboard = await getAgentDashboard(req.agentKey);
    res.json(dashboard);
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// Session budget summary (PRD-aligned: total_budget_cents on session level)
app.get("/api/session/summary", requireSession, apiLimiter, async (req, res) => {
  try {
    const summary = await getSessionSummary(req.agentKey);
    res.json(summary);
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── Orders/Reserves/Debits/Audit (read) ──
// Single-record lookups the public checkout page needs stay open.
app.get("/api/orders/:id", apiLimiter, async (req, res) => {
  try {
    const o = await getOrder(req.params.id);
    if (!o) return err(res, 404, "Order not found", "ORDER_NOT_FOUND");
    res.json(o);
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// Lists expose all records (PII, approval tokens, consent ids) — require an agent
// session and redact sensitive fields so an agent only sees what it needs.
function redactReserve(r) {
  if (!r) return r;
  const { approval_token, ...rest } = r;
  return rest;
}
function redactOrder(o) {
  if (!o) return o;
  const { payment_id, receipt, ...rest } = o;
  return rest;
}

app.get("/api/orders", requireSession, apiLimiter, async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json({ count: orders.length, orders: orders.map(redactOrder) });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/reserves", requireSession, apiLimiter, async (req, res) => {
  try {
    const reserves = await getAllReserves();
    res.json({ count: reserves.length, reserves: reserves.map(redactReserve) });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/debits", requireSession, apiLimiter, async (req, res) => {
  try {
    const debits = await getAllDebits();
    res.json({ count: debits.length, debits });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.get("/api/audit", requireSession, apiLimiter, async (req, res) => {
  try {
    const audits = await getAudit(100);
    res.json({ count: audits.length, audits });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

app.post("/api/test/reset", requireSession, writeLimiter, async (req, res) => {
  try {
    await resetAll();
    res.json({ ok: true });
  } catch (e) {
    return err(res, 500, e.message || "Internal error", "INTERNAL_ERROR");
  }
});

// ── llms.txt ──
function sendLlmsTxt(req, res) {
  const maxReserve = RESERVE_MAX / 100;
  const catLines = Object.entries(categoriesData).map(([cat, n]) => `  - ${cat}: ${n} items`).join("\n");
  res.type("text/plain").send(`# AgentCart — AI Agent Commerce API
# A Razorpay-powered food ordering API for autonomous AI agents.
# Auth: HMAC signed requests for /api/reserve/create, /api/checkout/create, /api/agent/login.
#   Headers: x-agent-id, x-nonce, x-timestamp, x-signature
#   signature = HMAC-SHA256(secret, METHOD + PATH + TIMESTAMP + NONCE + BODY)
# Human approval: /api/checkout/approve uses a short-lived capability (x-capability), never a static key.
# Public: GET /api/catalog, GET /api/orders, GET /api/health, /llms.txt
# Dashboard: POST /api/agent/login -> GET /api/agent/dashboard (Bearer token)

## API Reference
  GET  /api/catalog/...         - List products (q, category, price_min, price_max, limit, offset)
  POST /api/reserve/create      - HITL step 1: bounded reserve + approval_token (HMAC)
  POST /api/checkout/create     - HITL step 2: prepare cart, store items in reserve (HMAC)
  POST /api/approval/request-token - HITL step 2.5: short-lived capability for Approve UI (HMAC)
  POST /api/checkout/approve    - HITL step 3: human approves via capability, Razorpay order
  POST /api/orders/create       - Public checkout w/ proof-of-work + strict rate limit
  POST /api/webhook             - Razorpay webhook (signature verified, unknown events rejected)
  GET  /api/orders              - All orders
  GET  /api/orders/:id          - Single order
  POST /api/agent/login         - Get dashboard token (HMAC)
  GET  /api/agent/dashboard     - Agent KPIs + orders + activities (Bearer token)
  GET  /api/agent/activities    - Agent activity feed (Bearer token)

## Products
${listCatalog().products.map(p => `  ${p.id}  ${p.name}  Rs${p.price / 100}  stock ${p.stock}`).join("\n")}

## Categories
${catLines}

## HITL Checkout Flow (Human-in-the-Loop)
  1. Agent (HMAC): POST /api/reserve/create { max_block_inr: 500, consent: true }
     → returns reserve + approval_token
  2. Agent (HMAC): POST /api/checkout/create { items, reserve_id }
     → returns cart, status: "pending_approval" (NO Razorpay order yet)
  2.5 Agent (HMAC): POST /api/approval/request-token { reserve_id } → capability
  3. Agent: Send user the URL #/checkout?reserve_id=..&approval_token=..&capability=.., WAIT
  4. Human: Clicks "Approve" in UI
  5. Frontend: POST /api/checkout/approve { reserve_id, approval_token, idempotency_key } + x-capability
     → validates capability + token, creates Razorpay order
  6. Customer pays via Checkout.js (success@razorpay test)
  7. Webhook confirms: payment.captured → paid
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

await initDB();

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.js')) {
  app.listen(PORT, () => console.log(`AgentCart server listening http://localhost:${PORT} mode=${getMode()}`));
}
export default app;

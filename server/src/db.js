import { Pool } from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
const __dirname = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    razorpay_order_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    receipt TEXT,
    items TEXT,
    reserve_id TEXT,
    explainability TEXT,
    agent_key TEXT,
    status TEXT DEFAULT 'created',
    payment_id TEXT,
    failure_reason TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reserves (
    id TEXT PRIMARY KEY,
    user_phone TEXT,
    max_block INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consent_txn_id TEXT,
    status TEXT DEFAULT 'active',
    approval_token TEXT,
    agent_key TEXT,
    items TEXT,
    human_pin TEXT,
    human_pin_hash TEXT,
    human_pin_used INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debits (
    id TEXT PRIMARY KEY,
    reserve_id TEXT,
    order_id TEXT,
    amount INTEGER NOT NULL,
    reason TEXT,
    status TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    input TEXT,
    output TEXT,
    timestamp TEXT NOT NULL,
    bounded_check TEXT,
    consent INTEGER
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    agent_key TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT,
    status TEXT DEFAULT 'success',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    catalog_mode TEXT NOT NULL DEFAULT 'hosted',
    external_api_url TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hosted_products (
    merchant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    stock INTEGER NOT NULL DEFAULT 0,
    category TEXT,
    veg INTEGER DEFAULT 1,
    description TEXT,
    image TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (merchant_id, id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities(agent_key);
  CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_key);
`;

const MIGRATE_SQL = [
  "ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_key TEXT",
  "ALTER TABLE reserves ADD COLUMN IF NOT EXISTS human_pin TEXT",
  "ALTER TABLE reserves ADD COLUMN IF NOT EXISTS human_pin_hash TEXT",
  "ALTER TABLE reserves ADD COLUMN IF NOT EXISTS human_pin_used INTEGER DEFAULT 0",
];

export async function initDB() {
  await pool.query(CREATE_TABLES_SQL);
  for (const sql of MIGRATE_SQL) {
    try { await pool.query(sql); } catch (_) { /* column already exists */ }
  }
}

let seq = Date.now();
export function nextId(prefix) { return `${prefix}_${seq++}`; }

export async function audit(action, input, output, meta = {}) {
  const e = {
    id: nextId('audit'),
    action,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    output: typeof output === 'string' ? output : JSON.stringify(output),
    timestamp: new Date().toISOString(),
    ...meta,
  };
  await pool.query(
    'INSERT INTO audit (id, action, input, output, timestamp, bounded_check, consent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [e.id, e.action, e.input, e.output, e.timestamp, e.bounded_check || null, e.consent ? 1 : 0]
  );
  return e;
}

export async function getAudit(limit = 50) {
  const r = await pool.query('SELECT * FROM audit ORDER BY id DESC LIMIT $1', [limit]);
  return r.rows;
}

// Orders
export async function insertOrder(record) {
  await pool.query(
    'INSERT INTO orders (id, razorpay_order_id, amount, currency, receipt, items, reserve_id, explainability, agent_key, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    [record.id, record.razorpay_order_id, record.amount, record.currency, record.receipt, JSON.stringify(record.items), record.reserve_id || null, JSON.stringify(record.explainability), record.agent_key || null, record.status, record.created_at]
  );
  return record;
}

export async function updateOrder(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = $${sets.length + 1}`); vals.push(typeof v === 'object' ? JSON.stringify(v) : v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
}

export async function getOrder(id) {
  const r = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  const row = r.rows[0] || null;
  if (row && row.items) row.items = JSON.parse(row.items);
  if (row && row.explainability) row.explainability = JSON.parse(row.explainability);
  return row;
}

export async function getOrderByRazorpayId(razorpayOrderId) {
  const r = await pool.query('SELECT * FROM orders WHERE razorpay_order_id = $1', [razorpayOrderId]);
  const row = r.rows[0] || null;
  if (row && row.items) row.items = JSON.parse(row.items);
  if (row && row.explainability) row.explainability = JSON.parse(row.explainability);
  return row;
}

export async function getAllOrders() {
  const r = await pool.query('SELECT * FROM orders ORDER BY id DESC');
  return r.rows.map(r => {
    if (r.items) r.items = JSON.parse(r.items);
    if (r.explainability) r.explainability = JSON.parse(r.explainability);
    return r;
  });
}

// Reserves
export async function insertReserve(record) {
  await pool.query(
    'INSERT INTO reserves (id, user_phone, max_block, remaining, created_at, expires_at, consent_txn_id, status, approval_token, agent_key, items, human_pin, human_pin_hash, human_pin_used) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [record.id, record.user_phone, record.max_block, record.remaining, record.created_at, record.expires_at, record.consent_txn_id, record.status, record.approval_token || null, record.agent_key || null, record.items || null, record.human_pin || null, record.human_pin_hash || null, record.human_pin_used || 0]
  );
  return record;
}

export async function getReserve(id) {
  const r = await pool.query('SELECT * FROM reserves WHERE id = $1', [id]);
  return r.rows[0] || null;
}

export async function updateReserve(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = $${sets.length + 1}`); vals.push(v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  await pool.query(`UPDATE reserves SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
}

export async function getAllReserves() {
  const r = await pool.query('SELECT * FROM reserves ORDER BY id DESC');
  return r.rows;
}

// Debits
export async function insertDebit(record) {
  await pool.query(
    'INSERT INTO debits (id, reserve_id, order_id, amount, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [record.id, record.reserve_id, record.order_id, record.amount, record.reason, record.status, record.created_at]
  );
  return record;
}

export async function getAllDebits() {
  const r = await pool.query('SELECT * FROM debits ORDER BY id DESC');
  return r.rows;
}

// Activities
export async function logActivity(agentKey, type, data, status = 'success') {
  const id = nextId('act');
  const created_at = new Date().toISOString();
  await pool.query(
    'INSERT INTO activities (id, agent_key, type, data, status, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, agentKey, type, typeof data === 'string' ? data : JSON.stringify(data), status, created_at]
  );
  return { id, agent_key: agentKey, type, data, status, created_at };
}

export async function getAgentActivities(agentKey, limit = 50) {
  const r = await pool.query('SELECT * FROM activities WHERE agent_key = $1 ORDER BY id DESC LIMIT $2', [agentKey, limit]);
  return r.rows;
}

export async function getAgentDashboard(agentKey) {
  const orders = (await pool.query('SELECT * FROM orders WHERE agent_key = $1 ORDER BY id DESC LIMIT 100', [agentKey])).rows;
  const activities = (await pool.query('SELECT * FROM activities WHERE agent_key = $1 ORDER BY id DESC LIMIT 50', [agentKey])).rows;
  const totalOrders = (await pool.query('SELECT COUNT(*) as count FROM orders WHERE agent_key = $1', [agentKey])).rows[0].count;
  const paidOrders = (await pool.query("SELECT COUNT(*) as count FROM orders WHERE agent_key = $1 AND status = 'paid'", [agentKey])).rows[0].count;
  const failedOrders = (await pool.query("SELECT COUNT(*) as count FROM orders WHERE agent_key = $1 AND status = 'failed'", [agentKey])).rows[0].count;
  const totalRevenue = (await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE agent_key = $1 AND status = 'paid'", [agentKey])).rows[0].total;
  return {
    totalOrders, paidOrders, failedOrders, totalRevenue,
    successRate: totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0,
    orders: orders.map(o => { if (o.items) o.items = JSON.parse(o.items); if (o.explainability) o.explainability = JSON.parse(o.explainability); if (o.agent_key) delete o.agent_key; return o; }),
    activities
  };
}

export async function getSessionSummary(agentKey) {
  const reserves = await pool.query('SELECT max_block, remaining FROM reserves WHERE agent_key = $1', [agentKey]);
  const totalBudgetCents = reserves.rows.reduce((sum, r) => sum + parseInt(r.max_block || 0, 10), 0);
  const remainingCents = reserves.rows.reduce((sum, r) => sum + parseInt(r.remaining || 0, 10), 0);
  const spentCents = totalBudgetCents - remainingCents;
  return {
    total_budget_cents: totalBudgetCents,
    spent_cents: spentCents,
    remaining_cents: remainingCents,
    reserve_count: reserves.rows.length
  };
}

// Idempotency
export async function checkIdempotency(key) {
  const r = await pool.query('SELECT response FROM idempotency_keys WHERE key = $1', [key]);
  const row = r.rows[0] || null;
  return row ? JSON.parse(row.response) : null;
}

export async function storeIdempotency(key, response) {
  await pool.query('INSERT INTO idempotency_keys (key, response, created_at) VALUES ($1, $2, $3)', [key, JSON.stringify(response), new Date().toISOString()]);
}

// Sessions
export async function createSession(agentKey) {
  const id = nextId('sess');
  const created_at = new Date().toISOString();
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await pool.query('INSERT INTO sessions (id, agent_key, created_at, expires_at) VALUES ($1, $2, $3, $4)', [id, agentKey, created_at, expires_at]);
  return { id, agent_key: agentKey, created_at, expires_at };
}

export async function getSession(id) {
  const r = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return r.rows[0] || null;
}

export async function getActiveSession(agentKey) {
  const r = await pool.query('SELECT * FROM sessions WHERE agent_key = $1 AND expires_at > $2 ORDER BY id DESC LIMIT 1', [agentKey, new Date().toISOString()]);
  return r.rows[0] || null;
}

// Reset
export async function resetAll() {
  await pool.query('DELETE FROM orders; DELETE FROM reserves; DELETE FROM debits; DELETE FROM audit; DELETE FROM activities; DELETE FROM hosted_products; DELETE FROM merchants;');
  seq = Date.now();
}

// Merchants
export async function insertMerchant(record) {
  await pool.query('INSERT INTO merchants (id, name, catalog_mode, external_api_url, created_at) VALUES ($1, $2, $3, $4, $5)', [record.id, record.name, record.catalog_mode, record.external_api_url || null, record.created_at]);
  return record;
}

export async function getMerchantRow(id) {
  const r = await pool.query('SELECT * FROM merchants WHERE id = $1', [id]);
  return r.rows[0] || null;
}

export async function getAllMerchantRows() {
  const r = await pool.query('SELECT * FROM merchants ORDER BY id DESC');
  return r.rows;
}

export async function upsertHostedProduct(record) {
  await pool.query(
    'INSERT INTO hosted_products (merchant_id, id, name, price, currency, stock, category, veg, description, image, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT(merchant_id, id) DO UPDATE SET name=excluded.name, price=excluded.price, currency=excluded.currency, stock=excluded.stock, category=excluded.category, veg=excluded.veg, description=excluded.description, image=excluded.image',
    [record.merchant_id, record.id, record.name, record.price, record.currency || 'INR', record.stock, record.category || null, record.veg ? 1 : 0, record.description || null, record.image || null, record.created_at]
  );
  return record;
}

export async function getHostedProducts(merchantId) {
  const r = await pool.query('SELECT * FROM hosted_products WHERE merchant_id = $1 ORDER BY id', [merchantId]);
  return r.rows;
}

export async function getHostedProduct(merchantId, productId) {
  const r = await pool.query('SELECT * FROM hosted_products WHERE merchant_id = $1 AND id = $2', [merchantId, productId]);
  return r.rows[0] || null;
}

export default pool;

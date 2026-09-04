import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'agentcart.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    razorpay_order_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    receipt TEXT,
    items TEXT,
    reserve_id TEXT,
    explainability TEXT,
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
    status TEXT DEFAULT 'active'
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

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_activities_agent ON activities(agent_key);
  CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_key);
`);

let seq = Date.now();
export function nextId(prefix) { return `${prefix}_${seq++}`; }

export function audit(action, input, output, meta = {}) {
  const e = {
    id: nextId('audit'),
    action,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    output: typeof output === 'string' ? output : JSON.stringify(output),
    timestamp: new Date().toISOString(),
    ...meta,
  };
  db.prepare(`INSERT INTO audit (id, action, input, output, timestamp, bounded_check, consent) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(e.id, e.action, e.input, e.output, e.timestamp, e.bounded_check || null, e.consent ? 1 : 0);
  return e;
}

export function getAudit(limit = 50) {
  return db.prepare(`SELECT * FROM audit ORDER BY rowid DESC LIMIT ?`).all(limit);
}

// Orders
export function insertOrder(record) {
  db.prepare(`INSERT INTO orders (id, razorpay_order_id, amount, currency, receipt, items, reserve_id, explainability, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(record.id, record.razorpay_order_id, record.amount, record.currency, record.receipt, JSON.stringify(record.items), record.reserve_id || null, JSON.stringify(record.explainability), record.status, record.created_at);
  return record;
}

export function updateOrder(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(typeof v === 'object' ? JSON.stringify(v) : v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getOrder(id) {
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
  if (row && row.items) row.items = JSON.parse(row.items);
  if (row && row.explainability) row.explainability = JSON.parse(row.explainability);
  return row;
}

export function getOrderByRazorpayId(razorpayOrderId) {
  const row = db.prepare(`SELECT * FROM orders WHERE razorpay_order_id = ?`).get(razorpayOrderId);
  if (row && row.items) row.items = JSON.parse(row.items);
  if (row && row.explainability) row.explainability = JSON.parse(row.explainability);
  return row;
}

export function getAllOrders() {
  return db.prepare(`SELECT * FROM orders ORDER BY rowid DESC`).all().map(r => {
    if (r.items) r.items = JSON.parse(r.items);
    if (r.explainability) r.explainability = JSON.parse(r.explainability);
    return r;
  });
}

// Reserves
export function insertReserve(record) {
  db.prepare(`INSERT INTO reserves (id, user_phone, max_block, remaining, created_at, expires_at, consent_txn_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(record.id, record.user_phone, record.max_block, record.remaining, record.created_at, record.expires_at, record.consent_txn_id, record.status);
  return record;
}

export function getReserve(id) {
  return db.prepare(`SELECT * FROM reserves WHERE id = ?`).get(id);
}

export function updateReserve(id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE reserves SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function getAllReserves() {
  return db.prepare(`SELECT * FROM reserves ORDER BY rowid DESC`).all();
}

// Debits
export function insertDebit(record) {
  db.prepare(`INSERT INTO debits (id, reserve_id, order_id, amount, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(record.id, record.reserve_id, record.order_id, record.amount, record.reason, record.status, record.created_at);
  return record;
}

export function getAllDebits() {
  return db.prepare(`SELECT * FROM debits ORDER BY rowid DESC`).all();
}

// Activities (per-agent)
export function logActivity(agentKey, type, data, status = 'success') {
  const id = nextId('act');
  const created_at = new Date().toISOString();
  db.prepare(`INSERT INTO activities (id, agent_key, type, data, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, agentKey, type, typeof data === 'string' ? data : JSON.stringify(data), status, created_at);
  return { id, agent_key: agentKey, type, data, status, created_at };
}

export function getAgentActivities(agentKey, limit = 50) {
  return db.prepare(`SELECT * FROM activities WHERE agent_key = ? ORDER BY rowid DESC LIMIT ?`).all(agentKey, limit);
}

export function getAgentDashboard(agentKey) {
  const orders = db.prepare(`SELECT * FROM orders WHERE json_extract(explainability, '$.consent') LIKE '%' || ? || '%' ORDER BY rowid DESC LIMIT 100`).all(agentKey);
  const activities = db.prepare(`SELECT * FROM activities WHERE agent_key = ? ORDER BY rowid DESC LIMIT 50`).all(agentKey);
  const totalOrders = db.prepare(`SELECT COUNT(*) as count FROM orders`).get().count;
  const paidOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'paid'`).get().count;
  const failedOrders = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'failed'`).get().count;
  const totalRevenue = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'paid'`).get().total;
  return { totalOrders, paidOrders, failedOrders, totalRevenue, successRate: totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100) : 0, orders: orders.map(o => { if (o.items) o.items = JSON.parse(o.items); if (o.explainability) o.explainability = JSON.parse(o.explainability); return o; }), activities };
}

// Sessions
export function createSession(agentKey) {
  const id = nextId('sess');
  const created_at = new Date().toISOString();
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (id, agent_key, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(id, agentKey, created_at, expires_at);
  return { id, agent_key: agentKey, created_at, expires_at };
}

export function getSession(id) {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
}

// Reset
export function resetAll() {
  db.exec(`DELETE FROM orders; DELETE FROM reserves; DELETE FROM debits; DELETE FROM audit; DELETE FROM activities; DELETE FROM sessions;`);
  seq = Date.now();
}

export default db;

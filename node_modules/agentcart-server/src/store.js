// In-memory store — SQLite-ready, no external dep for testability
export const reserves = new Map(); // id -> {id, user_phone, max_block, remaining, created_at, expires_at, consent_txn_id, status}
export const orders = new Map(); // id -> {id, razorpay_order_id, amount, currency, receipt, items, explainability, status, created_at}
export const debits = []; // {id, reserve_id, order_id, amount, reason, status, created_at}
export const audits = []; // {id, action, input, output, timestamp, bounded_check, consent}

let seq = 1;
export function nextId(prefix) { return `${prefix}_${Date.now()}_${seq++}`; }
export function audit(action, input, output, meta = {}) {
  const e = { id: nextId('audit'), action, input, output, timestamp: new Date().toISOString(), ...meta };
  audits.push(e);
  return e;
}
export function resetStore() { reserves.clear(); orders.clear(); debits.length = 0; audits.length = 0; seq = 1; }

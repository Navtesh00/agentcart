import assert from "assert";
import crypto from "crypto";

const base = "http://localhost:3001";
const AGENT_ID = "agent_demo";
const AGENT_SECRET = "demo_agent_secret_change_me_01";
const WEBHOOK_SECRET = "whsec_test_dummy";

// HMAC agent auth helper. server/src/index.js computes:
//   signature = HMAC-SHA256(secret, METHOD + PATH + TS + NONCE + BODY)
// Timestamp accepts ms (or normalized seconds).
function authed(method, path, body) {
  const bodyStr = body ? JSON.stringify(body) : "";
  const ts = String(Math.round(Date.now() / 1000)); // seconds are accepted by the server
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${method}${path}${ts}${nonce}${bodyStr}`;
  const sig = crypto.createHmac("sha256", AGENT_SECRET).update(payload).digest("hex");
  return {
    "Content-Type": "application/json",
    "x-agent-id": AGENT_ID,
    "x-nonce": nonce,
    "x-timestamp": ts,
    "x-signature": sig,
  };
}

async function j(path, opts = {}) {
  const r = await fetch(base + path, opts);
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: r.ok, status: r.status, j: parsed };
}

function signWebhook(bodyObj) {
  const bodyStr = JSON.stringify(bodyObj);
  const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(bodyStr).digest("hex");
  return { "Content-Type": "application/json", "x-razorpay-signature": sig };
}

(async () => {
  // Reset requires an agent session now
  const login = await j("/api/agent/login", { method: "POST", headers: authed("POST", "/api/agent/login", {}), body: JSON.stringify({}) });
  assert(login.ok, "agent login");
  const tok = login.j.token;
  const authH = { "Authorization": `Bearer ${tok}` };

  await j("/api/test/reset", { method: "POST", headers: authH });

  // Bounded reserve via HMAC auth
  const rsv = await j("/api/reserve/create", { method: "POST", headers: authed("POST", "/api/reserve/create", { max_block_inr: 10000, consent: true }), body: JSON.stringify({ max_block_inr: 10000, consent: true }) });
  assert(rsv.ok, "reserve create");
  const rid = rsv.j.reserve.id;

  let ok = 0, blocked = 0;
  const results = [];
  for (let i = 0; i < 50; i++) {
    const qty = (i % 3) + 1;
    const id = ["p1", "p3", "p5", "p6"][i % 4];
    const over = i === 25;
    const items = over ? [{ id: "p2", qty: 30 }] : [{ id, qty }];
    const body = { items, reserve_id: rid };
    const res = await j("/api/checkout/create", { method: "POST", headers: authed("POST", "/api/checkout/create", body), body: JSON.stringify(body) });
    if (res.ok) { ok++; results.push({ i, status: "ok", amount: res.j.order.amount, audit: res.j.audit.id }); }
    else { blocked++; results.push({ i, status: "blocked", error: res.j.error, audit: res.j.audit?.id }); }
  }
  console.log(`EVAL 50: ok=${ok} blocked=${blocked}`);

  // Audit trail is protected — read with agent session
  const audit = await j("/api/audit", { headers: authH });
  assert(audit.ok, "audit via session");
  assert(audit.j.count >= 51, "audit trail");

  const fs = await import("fs");
  const csv = ["i,status,amount_or_error,audit"].concat(results.map(r => `${r.i},${r.status},${r.amount || r.error},${r.audit}`)).join("\n");
  fs.writeFileSync("D:/MunderDifflin/agentcart/docs/eval/results.csv", csv);
  fs.writeFileSync("D:/MunderDifflin/agentcart/docs/eval/summary.json", JSON.stringify({ total: 50, ok, blocked, audits: audit.j.count, reserve_id: rid }, null, 2));

  // Webhook requires a valid HMAC signature now (reject invalid)
  const badWh = await j("/api/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": "deadbeef" }, body: JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: "whatever" } } } }) });
  assert(!badWh.ok, "webhook must reject invalid signature");
  console.log("WEBHOOK invalid-signature correctly rejected:", badWh.status);

  console.log("EVAL PASS");
})();

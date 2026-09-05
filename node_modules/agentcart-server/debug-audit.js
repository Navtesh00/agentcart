import crypto from 'crypto';
const AGENT_ID = 'agent_demo';
const AGENT_SECRET = 'demo_agent_secret_change_me_01';
function authed(method, path, body) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const ts = String(Math.round(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${method}${path}${ts}${nonce}${bodyStr}`;
  const sig = crypto.createHmac('sha256', AGENT_SECRET).update(payload).digest('hex');
  return {
    'Content-Type': 'application/json',
    'x-agent-id': AGENT_ID,
    'x-nonce': nonce,
    'x-timestamp': ts,
    'x-signature': sig,
  };
}
async function j(path, opts = {}) {
  const r = await fetch('http://localhost:3001' + path, opts);
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: r.ok, status: r.status, j: parsed };
}
const login = await j('/api/agent/login', { method: 'POST', headers: authed('POST', '/api/agent/login', {}), body: JSON.stringify({}) });
console.log('Login:', login.ok, login.j);
if (login.ok) {
  const tok = login.j.token;
  const authH = { 'Authorization': 'Bearer ' + tok };
  const audit = await j('/api/audit', { headers: authH });
  console.log('Audit:', audit.ok, audit.status, audit.j);
}
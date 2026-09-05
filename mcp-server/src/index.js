#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import crypto from "crypto";
import { z } from "zod";

const API_BASE = process.env.AGENTCART_API || "http://localhost:3001";
// HMAC auth config — must match AGENT_SECRETS in server .env
const AGENT_ID = process.env.AGENTCART_AGENT_ID || "agent_demo";
const AGENT_SECRET = process.env.AGENTCART_AGENT_SECRET || "demo_agent_secret_change_me_01";

// Sign each request: HMAC-SHA256(secret, METHOD + PATH + TIMESTAMP + NONCE + BODY)
function sign(method, path, body) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString("hex");
  const rawBody = typeof body === "string" ? body : JSON.stringify(body || {});
  const payload = `${method}${path}${timestamp}${nonce}${rawBody}`;
  const signature = crypto.createHmac("sha256", AGENT_SECRET).update(payload).digest("hex");
  return {
    "x-agent-id": AGENT_ID,
    "x-nonce": nonce,
    "x-timestamp": timestamp,
    "x-signature": signature,
  };
}

async function api(path, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body; // string (already JSON-serialized)
  const headers = {
    "Content-Type": "application/json",
    ...sign(method, path, body),
    ...opts.headers,
  };
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body !== undefined ? body : undefined });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return j;
}

const server = new Server({ name: "agentcart-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "list_catalog", description: "List agent-readable catalog, filter by query/price/category. Returns bounded prices.", inputSchema: { type: "object", properties: { query: { type: "string" }, price_max: { type: "number" }, price_min: { type: "number" }, category: { type: "string" } } } },
    { name: "get_product", description: "Get single product by id with price/stock/bounds", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "create_agent_checkout", description: "HITL STEP 2 — Prepare cart only (NO payment executed). Stores items in reserve for later approval. After this, show the cart to the user and WAIT for them to click Approve. Requires reserve_id from create_reserve.", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, qty: { type: "number" } }, required: ["id", "qty"] } }, reserve_id: { type: "string" }, customer: { type: "object", properties: { name: { type: "string" }, contact: { type: "string" }, email: { type: "string" } } } }, required: ["items", "reserve_id"] } },
    { name: "create_reserve", description: "HITL STEP 1 — MANDATORY FIRST STEP: Create a bounded reserve to block funds safely. Returns an 'approval_token' which you MUST show to the user. Do NOT proceed to checkout until the user approves. Max Rs 10000, 90d validity, gated by consent.", inputSchema: { type: "object", properties: { max_block_inr: { type: "number" }, user_phone: { type: "string" } } } },
    { name: "create_agent_payment", description: "HITL STEP 3 — DANGER: DO NOT CALL THIS TOOL unless the user has explicitly clicked 'Approve' in the UI and you have received an 'approval_token'. You MUST include an 'idempotency_key' (UUID) to prevent double charges. This tool actually executes the payment by creating a Razorpay Order.", inputSchema: { type: "object", properties: { reserve_id: { type: "string" }, approval_token: { type: "string" }, idempotency_key: { type: "string" } }, required: ["reserve_id", "approval_token", "idempotency_key"] } },
    { name: "request_approval_capability", description: "HITL STEP 2.5 — After preparing the cart, call this to obtain a short-lived 'capability' for the human approval UI. Construct the checkout URL as: WEB_URL#/checkout?reserve_id=...&approval_token=...&capability=... and show it to the user so they can click Approve. Do NOT call create_agent_payment yourself — the human's UI will execute it.", inputSchema: { type: "object", properties: { reserve_id: { type: "string" } }, required: ["reserve_id"] } },
    { name: "get_reserve_status", description: "Get reserve remaining/balance/expiry/audit", inputSchema: { type: "object", properties: { reserve_id: { type: "string" } }, required: ["reserve_id"] } }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "list_catalog") {
      const q = new URLSearchParams(); if (args.query) q.set("q", args.query); if (args.price_max) q.set("price_max", args.price_max); if (args.price_min) q.set("price_min", args.price_min); if (args.category) q.set("category", args.category);
      const j = await api(`/api/catalog?${q.toString()}`);
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    if (name === "get_product") {
      const j = await api(`/api/catalog/${args.id}`);
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    if (name === "create_agent_checkout") {
      const j = await api(`/api/checkout/create`, { method: "POST", body: JSON.stringify(args) });
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    if (name === "create_agent_payment") {
      const j = await api(`/api/checkout/approve`, { method: "POST", body: JSON.stringify(args) });
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    if (name === "create_reserve") {
      const j = await api(`/api/reserve/create`, { method: "POST", body: JSON.stringify(args) });
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    if (name === "request_approval_capability") {
      const j = await api(`/api/approval/request-token`, { method: "POST", body: JSON.stringify({ reserve_id: args.reserve_id }) });
      return { content: [{ type: "text", text: JSON.stringify({ ...j, checkout_url: `#/checkout?reserve_id=${args.reserve_id}&capability=${j.capability}`, note: "Append &approval_token=<token> from create_reserve. Send this URL to the user in the chat so they can click Approve." }, null, 2) }] };
    }
    if (name === "get_reserve_status") {
      const j = await api(`/api/reserve/${args.reserve_id}`);
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
    }
    throw new Error(`unknown tool ${name}`);
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`AgentCart MCP running — API ${API_BASE}`);

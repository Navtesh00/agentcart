#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const API_BASE = process.env.AGENTCART_API || "http://localhost:3001";

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return j;
}

const server = new Server({ name: "agentcart-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "list_catalog", description: "List agent-readable catalog, filter by query/price/category. Returns bounded prices.", inputSchema: { type: "object", properties: { query: { type: "string" }, price_max: { type: "number" }, price_min: { type: "number" }, category: { type: "string" } } } },
    { name: "get_product", description: "Get single product by id with price/stock/bounds", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "create_agent_checkout", description: "Create bounded explainable checkout. Items [{id,qty}], optional reserve_id for Reserve Pay debit. Every amount bounded by stock + reserve remaining.", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, qty: { type: "number" } }, required: ["id", "qty"] } }, reserve_id: { type: "string" }, customer: { type: "object", properties: { name: { type: "string" }, contact: { type: "string" }, email: { type: "string" } } } }, required: ["items"] } },
    { name: "create_reserve", description: "Create Reserve Pay block (SBMD simulation) max Rs 10000, 90d validity, gated by consent", inputSchema: { type: "object", properties: { max_block_inr: { type: "number" }, user_phone: { type: "string" } } } },
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
    if (name === "create_reserve") {
      const j = await api(`/api/reserve/create`, { method: "POST", body: JSON.stringify(args) });
      return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
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

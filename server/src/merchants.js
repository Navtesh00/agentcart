import {
  insertMerchant,
  getMerchantRow,
  getAllMerchantRows,
  upsertHostedProduct,
  getHostedProducts,
  getHostedProduct,
  nextId,
} from "./db.js";
import NodeCache from 'node-cache';
const catalogCache = new NodeCache({ stdTTL: 60, checkperiod: 60 });

function toMerchant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    catalog_config: {
      mode: row.catalog_mode,
      ...(row.external_api_url ? { external_api_url: row.external_api_url } : {}),
    },
    created_at: row.created_at,
  };
}

function validateCatalogConfig(catalog_config) {
  const mode = catalog_config?.mode;
  if (mode !== "external" && mode !== "hosted") {
    throw new Error(`invalid catalog_config.mode: expected 'external' | 'hosted'`);
  }
  if (mode === "external") {
    const url = catalog_config.external_api_url;
    if (!url || typeof url !== "string") {
      throw new Error(`external_api_url required when catalog_config.mode is 'external'`);
    }
    try {
      const u = new URL(url);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol");
    } catch {
      throw new Error(`invalid external_api_url: ${url}`);
    }
  }
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    currency: row.currency || "INR",
    stock: row.stock,
    ...(row.category ? { category: row.category } : {}),
    veg: !!row.veg,
    ...(row.description ? { desc: row.description } : {}),
    ...(row.image ? { img: row.image } : {}),
  };
}

function normalizeExternalProduct(p) {
  if (!p || typeof p.id !== "string" || typeof p.name !== "string") {
    throw new Error("external product missing id/name");
  }
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    currency: p.currency || "INR",
    stock: Number(p.stock ?? 0),
    ...(p.category ? { category: p.category } : {}),
    veg: p.veg ?? true,
    ...(p.desc || p.description ? { desc: p.desc || p.description } : {}),
    ...(p.img || p.image ? { img: p.img || p.image } : {}),
  };
}

function applyFilters(products, { query, price_min, price_max, category, limit = 10, offset = 0 } = {}) {
  let r = [...products];
  if (query) {
    const q = String(query).toLowerCase();
    r = r.filter((p) => `${p.name} ${p.category || ""} ${p.desc || p.description || ""} ${p.id}`.toLowerCase().includes(q));
  }
  if (category) r = r.filter((p) => p.category === category);
  if (price_min != null && price_min !== "") r = r.filter((p) => p.price >= Number(price_min) * 100);
  if (price_max != null && price_max !== "") r = r.filter((p) => p.price <= Number(price_max) * 100);
  const total = r.length;
  const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 200);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sliced = r.slice(safeOffset, safeOffset + safeLimit);
  return { count: sliced.length, total, offset: safeOffset, limit: safeLimit, has_more: safeOffset + sliced.length < total, products: sliced };
}

// ── Merchant CRUD ──

export async function createMerchant({ name, catalog_config }) {
  if (!name || typeof name !== "string") throw new Error("merchant name required");
  validateCatalogConfig(catalog_config);
  const record = {
    id: nextId("mch"),
    name,
    catalog_mode: catalog_config.mode,
    external_api_url: catalog_config.mode === "external" ? catalog_config.external_api_url : null,
    created_at: new Date().toISOString(),
  };
  await insertMerchant(record);
  return toMerchant({ ...record });
}

export async function getMerchant(id) {
  return toMerchant(await getMerchantRow(id));
}

export async function listMerchants() {
  return (await getAllMerchantRows()).map(toMerchant);
}

async function requireMerchant(id) {
  const m = await getMerchant(id);
  if (!m) {
    const e = new Error(`merchant not found: ${id}`);
    e.status = 404;
    e.code = "merchant_not_found";
    throw e;
  }
  return m;
}

// ── SMB hosted catalog (stored in our DB) ──

export async function addHostedProduct(merchantId, { id, name, price, stock, category, veg = true, desc, description, img, image, currency = "INR" }) {
  const m = await requireMerchant(merchantId);
  if (m.catalog_config.mode !== "hosted") {
    throw new Error("merchant is not in hosted mode — hosted products only apply to mode='hosted'");
  }
  if (!id || !name) throw new Error("hosted product id + name required");
  if (!Number.isFinite(Number(price)) || Number(price) < 0) throw new Error("hosted product price must be >= 0 (paise)");
  if (!Number.isInteger(Number(stock)) || Number(stock) < 0) throw new Error("hosted product stock must be an integer >= 0");
  const record = {
    merchant_id: merchantId,
    id: String(id),
    name: String(name),
    price: Number(price),
    currency,
    stock: Number(stock),
    category: category || null,
    veg: veg ? 1 : 0,
    description: desc || description || null,
    image: img || image || null,
    created_at: new Date().toISOString(),
  };
  await upsertHostedProduct(record);
  return toProduct({ ...record, veg: record.veg });
}

// ── Enterprise external catalog (fetched on the fly, zero-data) ──

async function fetchExternalCatalog(external_api_url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(external_api_url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.products || data.items || data.menu || [];
    return list.map(normalizeExternalProduct);
  } catch (e) {
    const err = new Error(`external catalog fetch failed: ${e.message}`);
    err.status = 502;
    err.code = "external_catalog_unavailable";
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// ── Dynamic router ──

export async function getMerchantCatalog(merchantId, filters = {}) {
  const m = await requireMerchant(merchantId);
  if (m.catalog_config.mode === "hosted") {
    const rows = await getHostedProducts(merchantId);
    const products = rows.map(toProduct);
    return { merchant_id: merchantId, source: "hosted", ...applyFilters(products, filters) };
  }
  const cacheKey = `catalog:${m.catalog_config.external_api_url}`;
  let products = catalogCache.get(cacheKey);
  if (!products) {
    products = await fetchExternalCatalog(m.catalog_config.external_api_url);
    catalogCache.set(cacheKey, products);
  }
  return { merchant_id: merchantId, source: "external", ...applyFilters(products, filters) };
}

export async function getMerchantProduct(merchantId, productId) {
  const m = await requireMerchant(merchantId);
  if (m.catalog_config.mode === "hosted") {
    const row = await getHostedProduct(merchantId, productId);
    return row ? toProduct(row) : null;
  }
  const products = await fetchExternalCatalog(m.catalog_config.external_api_url);
  return products.find((p) => p.id === productId) || null;
}

export async function calcMerchantTotal(merchantId, items) {
  let total = 0;
  const details = [];
  for (const { id, qty } of items) {
    const p = await getMerchantProduct(merchantId, id);
    if (!p) throw new Error(`unknown product ${id}`);
    if (qty > p.stock) throw new Error(`out of stock ${id}`);
    const line = p.price * qty;
    total += line;
    details.push({ ...p, qty, line });
  }
  return { total, details };
}

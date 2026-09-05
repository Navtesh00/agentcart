import NodeCache from 'node-cache';
import {
  insertMerchant,
  getMerchantRow,
  getAllMerchantRows,
  upsertHostedProduct,
  getHostedProducts,
  getHostedProduct,
  nextId,
} from './db.js';

// 60-second TTL cache for external catalog responses.
const catalogCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

// ── Internal helpers ──

/**
 * Fetch an external merchant catalog (HTTP), with 60-second node-cache TTL.
 * @param {string} url  - The external_api_url from the merchant row.
 * @param {object} params - Query params to forward (q, category, etc.)
 * @returns {Promise<{products: object[], count: number, total: number}>}
 */
async function fetchExternalCatalog(url, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  ).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;
  const cacheKey = fullUrl;

  const cached = catalogCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const res = await fetch(fullUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`External catalog fetch failed: ${res.status} ${res.statusText}`);
    err.status = 502;
    err.code = 'external_catalog_error';
    throw err;
  }
  const data = await res.json();
  // Normalise: expect { products: [...] } or a bare array.
  const products = Array.isArray(data) ? data : (data.products || []);
  const result = { products, count: products.length, total: data.total ?? products.length };
  catalogCache.set(cacheKey, result);
  return result;
}

// ── Public API ──

/**
 * Create a new merchant (hosted or external).
 * @param {{ name: string, catalog_config: { mode: string, external_api_url?: string } }} validated
 */
export async function createMerchant(validated) {
  const { name, catalog_config } = validated;
  const id = nextId('mrc');
  const record = {
    id,
    name,
    catalog_mode: catalog_config.mode,
    external_api_url: catalog_config.mode === 'external' ? catalog_config.external_api_url : null,
    created_at: new Date().toISOString(),
  };
  await insertMerchant(record);
  return { ...record, catalog_config };
}

/**
 * Get a single merchant by id (returns null if not found).
 */
export async function getMerchant(id) {
  const row = await getMerchantRow(id);
  if (!row) return null;
  return {
    ...row,
    catalog_config: {
      mode: row.catalog_mode,
      external_api_url: row.external_api_url || undefined,
    },
  };
}

/**
 * List all merchants.
 */
export async function listMerchants() {
  const rows = await getAllMerchantRows();
  return rows.map(row => ({
    ...row,
    catalog_config: {
      mode: row.catalog_mode,
      external_api_url: row.external_api_url || undefined,
    },
  }));
}

/**
 * Add (upsert) a hosted product to a merchant catalog.
 * Only valid for merchants in hosted mode.
 */
export async function addHostedProduct(merchantId, validated) {
  const merchant = await getMerchantRow(merchantId);
  if (!merchant) {
    const err = new Error('merchant not found');
    err.status = 404;
    err.code = 'merchant_not_found';
    throw err;
  }
  if (merchant.catalog_mode !== 'hosted') {
    const err = new Error('merchant is not in hosted catalog mode');
    err.status = 400;
    err.code = 'not_hosted_mode';
    throw err;
  }
  const record = {
    merchant_id: merchantId,
    id: validated.id,
    name: validated.name,
    price: validated.price,
    currency: validated.currency || 'INR',
    stock: validated.stock,
    category: validated.category || null,
    veg: validated.veg !== false,
    description: validated.description || validated.desc || null,
    image: validated.image || validated.img || null,
    created_at: new Date().toISOString(),
  };
  await upsertHostedProduct(record);
  return record;
}

/**
 * Get a merchant catalog (hosted DB or external HTTP with 60s cache).
 * Returns { products, count, total, offset, limit }.
 */
export async function getMerchantCatalog(merchantId, { query, price_min, price_max, category, limit = 10, offset = 0 } = {}) {
  const merchant = await getMerchantRow(merchantId);
  if (!merchant) {
    const err = new Error('merchant not found');
    err.status = 404;
    err.code = 'merchant_not_found';
    throw err;
  }

  if (merchant.catalog_mode === 'external') {
    if (!merchant.external_api_url) {
      const err = new Error('external_api_url not configured for merchant');
      err.status = 500;
      err.code = 'misconfigured_merchant';
      throw err;
    }
    const result = await fetchExternalCatalog(merchant.external_api_url, { q: query, price_min, price_max, category, limit, offset });
    return { ...result, offset, limit };
  }

  // hosted mode: query from DB
  let products = await getHostedProducts(merchantId);
  if (query) {
    const q = query.toLowerCase();
    products = products.filter(p => (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().includes(q));
  }
  if (category) products = products.filter(p => p.category === category);
  if (price_min != null) products = products.filter(p => p.price >= Number(price_min) * 100);
  if (price_max != null) products = products.filter(p => p.price <= Number(price_max) * 100);
  const total = products.length;
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(Math.max(1, limit), 200);
  const page = products.slice(safeOffset, safeOffset + safeLimit);
  return { products: page, count: page.length, total, offset: safeOffset, limit: safeLimit };
}

/**
 * Get a single product from a merchant catalog.
 */
export async function getMerchantProduct(merchantId, productId) {
  const merchant = await getMerchantRow(merchantId);
  if (!merchant) {
    const err = new Error('merchant not found');
    err.status = 404;
    err.code = 'merchant_not_found';
    throw err;
  }
  if (merchant.catalog_mode === 'external') {
    const result = await fetchExternalCatalog(merchant.external_api_url, {});
    return result.products.find(p => String(p.id) === String(productId)) || null;
  }
  return getHostedProduct(merchantId, productId);
}

/**
 * Calculate total for a merchant catalog items.
 * @param {string} merchantId
 * @param {Array<{id: string, qty: number}>} items
 * @returns {Promise<{total: number, details: object[]}>}
 */
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

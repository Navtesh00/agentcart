import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  createMerchant,
  getMerchant,
  listMerchants,
  addHostedProduct,
  getMerchantCatalog,
  getMerchantProduct,
  calcMerchantTotal,
} from "../merchants.js";
import { resetAll, initDB } from "../db.js";

beforeEach(async () => { await initDB(); await resetAll(); });

describe("dual-mode catalog (enterprise API vs local SMB hosting)", () => {
  it("creates an enterprise merchant with catalog_config.mode='external'", async () => {
    const m = await createMerchant({
      name: "Big Enterprise",
      catalog_config: { mode: "external", external_api_url: "https://api.merchant.com/menu" },
    });
    assert.equal(m.catalog_config.mode, "external");
    assert.equal(m.catalog_config.external_api_url, "https://api.merchant.com/menu");
    const fetched = await getMerchant(m.id);
    assert.equal(fetched.id, m.id);
  });

  it("creates an SMB merchant with catalog_config.mode='hosted'", async () => {
    const m = await createMerchant({ name: "Local SMB", catalog_config: { mode: "hosted" } });
    assert.equal(m.catalog_config.mode, "hosted");
  });

  it("rejects invalid catalog_config.mode", async () => {
    await assert.rejects(
      async () => { await createMerchant({ name: "Bad", catalog_config: { mode: "invalid" } }); },
      /mode/
    );
  });

  it("requires external_api_url when mode='external'", async () => {
    await assert.rejects(
      async () => { await createMerchant({ name: "No URL", catalog_config: { mode: "external" } }); },
      /external_api_url/
    );
  });

  it("SMB/hosted mode serves catalog from local DB (zero external calls)", async () => {
    const m = await createMerchant({ name: "Tea Stall", catalog_config: { mode: "hosted" } });
    await addHostedProduct(m.id, { id: "chai", name: "Masala Chai", price: 3000, stock: 50, category: "beverages" });
    await addHostedProduct(m.id, { id: "bun", name: "Bun Maska", price: 2500, stock: 30, category: "bakery" });

    const result = await getMerchantCatalog(m.id, {});
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.products.map((p) => p.id).sort(),
      ["bun", "chai"]
    );
  });

  it("hosted catalog supports query/category/price filters + pagination", async () => {
    const m = await createMerchant({ name: "Filter Shop", catalog_config: { mode: "hosted" } });
    await addHostedProduct(m.id, { id: "a", name: "Paneer Roll", price: 10000, stock: 10, category: "rolls" });
    await addHostedProduct(m.id, { id: "b", name: "Chicken Roll", price: 15000, stock: 10, category: "rolls" });
    await addHostedProduct(m.id, { id: "c", name: "Cold Coffee", price: 8000, stock: 10, category: "drinks" });

    const byQuery = await getMerchantCatalog(m.id, { query: "roll" });
    assert.equal(byQuery.total, 2);

    const byCategory = await getMerchantCatalog(m.id, { category: "drinks" });
    assert.equal(byCategory.total, 1);

    const byPrice = await getMerchantCatalog(m.id, { price_min: 90, price_max: 120 });
    assert.equal(byPrice.total, 1);
    assert.equal(byPrice.products[0].id, "a");

    const paged = await getMerchantCatalog(m.id, { limit: 1, offset: 1 });
    assert.equal(paged.count, 1);
    assert.equal(paged.total, 3);
  });

  it("hosted getMerchantProduct + calcMerchantTotal enforce stock bounds", async () => {
    const m = await createMerchant({ name: "Bounds Shop", catalog_config: { mode: "hosted" } });
    await addHostedProduct(m.id, { id: "samosa", name: "Samosa", price: 2000, stock: 5, category: "snacks" });

    const p = await getMerchantProduct(m.id, "samosa");
    assert.equal(p.name, "Samosa");

    const missing = await getMerchantProduct(m.id, "nope");
    assert.equal(missing, null);

    const { total } = await calcMerchantTotal(m.id, [{ id: "samosa", qty: 2 }]);
    assert.equal(total, 4000);

    await assert.rejects(async () => { await calcMerchantTotal(m.id, [{ id: "samosa", qty: 99 }]); }, /stock/);
    await assert.rejects(async () => { await calcMerchantTotal(m.id, [{ id: "ghost", qty: 1 }]); }, /unknown product/);
  });

  it("enterprise/external mode fetches catalog via HTTP on the fly (zero-data)", async () => {
    const { createServer } = await import("node:http");
    const remoteMenu = [
      { id: "e1", name: "Enterprise Thali", price: 50000, stock: 20, category: "thali" },
    ];
    const srv = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(remoteMenu));
    });
    await new Promise((r) => srv.listen(0, r));
    const port = srv.address().port;
    try {
      const m = await createMerchant({
        name: "Enterprise",
        catalog_config: { mode: "external", external_api_url: `http://127.0.0.1:${port}/menu` },
      });
      const result = await getMerchantCatalog(m.id, {});
      assert.equal(result.total, 1);
      assert.equal(result.products[0].id, "e1");
      assert.equal(result.source, "external");

      const single = await getMerchantProduct(m.id, "e1");
      assert.equal(single.name, "Enterprise Thali");
    } finally {
      srv.close();
    }
  });

  it("external mode surfaces a 502-style error when the remote API is down", async () => {
    const m = await createMerchant({
      name: "Down Enterprise",
      catalog_config: { mode: "external", external_api_url: "http://127.0.0.1:1/unreachable" },
    });
    await assert.rejects(async () => { await getMerchantCatalog(m.id, {}); }, /external catalog fetch failed/);
  });

  it("unknown merchant id throws not-found", async () => {
    await assert.rejects(async () => { await getMerchantCatalog("mch_missing", {}); }, /merchant not found/);
  });

  it("listMerchants returns all merchants", async () => {
    await createMerchant({ name: "A", catalog_config: { mode: "hosted" } });
    await createMerchant({
      name: "B",
      catalog_config: { mode: "external", external_api_url: "https://api.b.com/menu" },
    });
    assert.equal((await listMerchants()).length >= 2, true);
  });
});

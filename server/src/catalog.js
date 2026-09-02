export const catalog = [
  { id: "p1", name: "Margherita Pizza", price: 29900, currency: "INR", stock: 100, category: "pizza", desc: "Classic cheese margherita" },
  { id: "p2", name: "Paneer Tikka Pizza", price: 39900, currency: "INR", stock: 80, category: "pizza", desc: "Paneer + capsicum" },
  { id: "p3", name: "Veg Burger", price: 14900, currency: "INR", stock: 120, category: "burger", desc: "Aloo tikki burger" },
  { id: "p4", name: "Chicken Burger", price: 19900, currency: "INR", stock: 60, category: "burger", desc: "Grilled chicken" },
  { id: "p5", name: "Coke 300ml", price: 4000, currency: "INR", stock: 200, category: "beverage", desc: "Coke" },
  { id: "p6", name: "Fries Large", price: 9900, currency: "INR", stock: 150, category: "sides", desc: "Peri-peri fries" },
  { id: "p7", name: "Garlic Bread", price: 12900, currency: "INR", stock: 90, category: "sides", desc: "Cheesy garlic bread" },
  { id: "p8", name: "Chocolate Brownie", price: 8900, currency: "INR", stock: 70, category: "dessert", desc: "Warm brownie" }
];

export function listCatalog({ query, price_min, price_max, category } = {}) {
  let r = [...catalog];
  if (query) r = r.filter(p => (p.name + p.desc + p.category).toLowerCase().includes(query.toLowerCase()));
  if (category) r = r.filter(p => p.category === category);
  if (price_min != null) r = r.filter(p => p.price >= price_min * 100);
  if (price_max != null) r = r.filter(p => p.price <= price_max * 100);
  return r;
}
export function getProduct(id) { return catalog.find(p => p.id === id) || null; }
export function calcTotal(items) {
  // items: [{id, qty}]
  let total = 0; const details = [];
  for (const { id, qty } of items) {
    const p = getProduct(id); if (!p) throw new Error(`unknown product ${id}`);
    if (qty > p.stock) throw new Error(`out of stock ${id}`);
    const line = p.price * qty;
    total += line;
    details.push({ ...p, qty, line });
  }
  return { total, details };
}

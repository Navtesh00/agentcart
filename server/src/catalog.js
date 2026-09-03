// Hotel Pranjal - 100% Pure Veg live demo catalog (mirrors https://www.hotelpranjal.in/ categories)
export const catalog = [
  { id: "p1", name: "Paneer Butter Masala", price: 28000, currency: "INR", stock: 100, category: "paneer", veg: true, desc: "Creamy paneer - Hotel Pranjal bestseller" },
  { id: "p2", name: "Paneer Tikka Dry", price: 26000, currency: "INR", stock: 80, category: "paneer", veg: true, desc: "Grilled paneer tikka" },
  { id: "p3", name: "Veg Biryani", price: 19900, currency: "INR", stock: 120, category: "rice", veg: true, desc: "Dum biryani with raita" },
  { id: "p4", name: "Dal Tadka + Jeera Rice Combo", price: 18000, currency: "INR", stock: 90, category: "dal", veg: true, desc: "Dal + jeera rice" },
  { id: "p5", name: "Pav Bhaji (Amul)", price: 12000, currency: "INR", stock: 150, category: "pavbhaji", veg: true, desc: "Mumbai pav bhaji with butter pav" },
  { id: "p6", name: "Veg Thali (Full)", price: 22000, currency: "INR", stock: 100, category: "thali", veg: true, desc: "Dal, sabzi, roti, rice, sweet - value meal" },
  { id: "p7", name: "Tandoor Roti (per pc)", price: 2500, currency: "INR", stock: 300, category: "rotis", veg: true, desc: "Fresh tandoor roti" },
  { id: "p8", name: "Masala Fries", price: 9900, currency: "INR", stock: 120, category: "fries", veg: true, desc: "Peri-peri fries" },
  { id: "p9", name: "Veg Crispy Chinese", price: 19000, currency: "INR", stock: 70, category: "chinese", veg: true, desc: "Indo-Chinese crispy" },
  { id: "p10", name: "Cold Coffee Mocktail", price: 8000, currency: "INR", stock: 200, category: "mocktails", veg: true, desc: "Cold coffee" }
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

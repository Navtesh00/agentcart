import Razorpay from "razorpay";
let instance = null;

// Razorpay test keys: dashboard.razorpay.com -> Test Mode. Dummy pay: success@razorpay / failure@razorpay via Checkout.js, cards 4111111111111111 / 5105105105105100 (razorpay.com/docs).
function hasValidKeys() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return false;
  if (key_id.includes("xxxx") || key_secret.includes("xxx")) return false;
  if (key_secret.length < 8) return false;
  if (!key_id.startsWith("rzp_")) return false; // rzp_test_ / rzp_live_ per api
  return true;
}
export function getRazorpay() {
  if (!hasValidKeys()) return null;
  if (!instance) instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  // Razorpay SDK uses api.razorpay.com (single endpoint for both test & live).
  // rzp_test_* keys hit test mode on api.razorpay.com; rzp_live_* keys hit live.
  // test.razorpay.com is an alias — no separate endpoint needed. No manual config.
  return instance;
}
export function getMode() {
  return getRazorpay() ? "test" : "mock";
}
export async function createOrder({ amount, currency = "INR", receipt, notes }) {
  const rzp = getRazorpay();
  if (!rzp) return { id: `order_mock_${Date.now()}`, amount, currency, receipt, status: "created", notes, mock: true };
  // amount in paise per Razorpay Orders API (razorpay.com/docs/api/orders/create)
  return await rzp.orders.create({ amount, currency, receipt, notes });
}
export async function createPaymentLink({ amount, currency, description, customer, notes, callback_url }) {
  const rzp = getRazorpay();
  if (!rzp) return { id: `plink_mock_${Date.now()}`, short_url: `https://rzp.io/mock/${Date.now()}`, amount, currency, description, status: "issued", mock: true };
  // Standard Links in test (UPI links Not supported in Test Mode) — graceful fallback, 30/batch limit
  return await rzp.paymentLink.create({ amount, currency, description, customer, notes, callback_url, callback_method: "get" });
}

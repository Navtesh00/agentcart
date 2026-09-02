import Razorpay from "razorpay";
let instance = null;
export function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret || key_id.includes("xxxx")) return null;
  if (!instance) instance = new Razorpay({ key_id, key_secret });
  return instance;
}
export async function createOrder({ amount, currency = "INR", receipt, notes }) {
  const rzp = getRazorpay();
  if (!rzp) return { id: `order_mock_${Date.now()}`, amount, currency, receipt, status: "created", notes, mock: true };
  return await rzp.orders.create({ amount, currency, receipt, notes });
}
export async function createPaymentLink({ amount, currency, description, customer, notes, callback_url }) {
  const rzp = getRazorpay();
  if (!rzp) return { id: `plink_mock_${Date.now()}`, short_url: `https://rzp.io/mock/${Date.now()}`, amount, currency, description, status: "issued", mock: true };
  return await rzp.paymentLink.create({ amount, currency, description, customer, notes, callback_url, callback_method: "get" });
}

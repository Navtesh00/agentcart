import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '../hooks/useCart.jsx';
import ApprovalCard from '../components/ApprovalCard.jsx';
import { toast } from 'sonner';

// Proof-of-work: find nonce so sha256(JSON.stringify(payload)+nonce) starts with '0000'
// Uses the same string the server verifies against (items + customer).
async function solvePow(payload) {
  const body = { ...payload, customer: payload.customer || {} };
  const base = JSON.stringify({ items: body.items, customer: body.customer });
  let nonce = 0;
  let hash = '';
  do {
    hash = await digest(base + nonce);
    nonce++;
  } while (!hash.startsWith('0000'));
  return { ...body, pow: String(nonce - 1) };
}
async function digest(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function Checkout() {
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const paymentId = params.get('payment_id');
  const orderId = params.get('order_id');
  const reserveId = params.get('reserve_id');
  const capability = params.get('capability');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(paymentId ? 'success' : orderId ? 'loading' : 'idle');
  const { items, total, clearCart } = useCart();

  // HITL mode: agent sent user here with a reserve awaiting human approval
  const isHITL = !!reserveId;

  // If coming from Razorpay success redirect
  useEffect(() => {
    if (orderId) {
      fetch(`/api/orders/${orderId}`)
        .then(r => r.json())
        .then(d => { setOrder(d); setStatus(d.status === 'paid' ? 'success' : d.status === 'failed' ? 'failed' : 'processing'); })
        .catch(() => setStatus('failed'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orderId]);

  // Fetch reserve details for HITL approval card
  const [reserveDetails, setReserveDetails] = useState(null);
  useEffect(() => {
    if (isHITL) {
      fetch(`/api/reserve/${reserveId}`)
        .then(r => r.json())
        .then(d => setReserveDetails(d))
        .catch(() => toast.error('Failed to load reserve details'));
    }
  }, [isHITL, reserveId]);

  // Handle successful approval
  const handleApprovalGranted = (result) => {
    setOrder(result.order);
    setStatus('processing');
    clearCart();
    // After Razorpay payment settles (via webhook), status will update
    setTimeout(() => {
      setStatus('success');
    }, 3000);
  };

  // Direct checkout without Razorpay (demo mode)
  const handleDirectCheckout = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const payload = { items: items.map(i => ({ id: i.id, qty: i.qty })) };
      const body = await solvePow(payload);
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrder(data.order);
      setStatus('processing');
      toast.success('Order placed! Processing payment…');
      setTimeout(() => { setStatus('success'); clearCart(); }, 2000);
    } catch (e) {
      toast.error(e.message);
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  // Razorpay Checkout.js popup
  const handleRazorpayCheckout = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const payload = { items: items.map(i => ({ id: i.id, qty: i.qty })) };
      const body = await solvePow(payload);
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrder(data.order);

      if (window.Razorpay) {
        const rzp = new window.Razorpay({
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TXPaQPvvVu85mH',
          amount: data.order.amount,
          currency: data.order.currency,
          name: 'Hotel Pranjal',
          description: `Order #${data.order.id}`,
          order_id: data.order.razorpay_order_id,
          handler: function (response) {
            setStatus('success');
            clearCart();
            toast.success('Payment successful!');
          },
          prefill: { contact: '9999999999', email: 'guest@hotelpranjal.com' },
          theme: { color: '#D4A574' },
          modal: { ondismiss: function () { setStatus('cancelled'); toast.info('Payment cancelled'); } }
        });
        rzp.open();
      } else {
        toast.info('Razorpay SDK not loaded — demo mode');
        setTimeout(() => { setStatus('success'); clearCart(); }, 2000);
      }
    } catch (e) {
      toast.error(e.message);
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──
  if (status === 'success' || paymentId) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass max-w-md w-full p-8 text-center">
          <CheckCircle2 size={64} className="text-mint mx-auto mb-4" />
          <h1 className="font-display text-3xl text-white font-semibold mb-2">Payment Successful!</h1>
          <p className="text-muted text-sm mb-6">Your order has been confirmed and is being prepared.</p>
          {order && (
            <div className="bg-noir/50 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted">Order ID</span>
                <span className="text-gold font-mono text-xs">{order.id}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted">Amount</span>
                <span className="text-white">₹{(order.amount / 100).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Status</span>
                <span className="text-mint font-mono text-xs uppercase">{order.status}</span>
              </div>
            </div>
          )}
          <a href="#/" className="inline-flex items-center gap-2 bg-gold hover:bg-gold/80 text-white px-6 py-3 rounded-lg font-semibold text-sm transition-colors">
            <ArrowRight size={16} /> Back to Menu
          </a>
        </motion.div>
      </div>
    );
  }

  // ── Failed state ──
  if (status === 'failed') {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass max-w-md w-full p-8 text-center">
          <XCircle size={64} className="text-red-400 mx-auto mb-4" />
          <h1 className="font-display text-3xl text-white font-semibold mb-2">Payment Failed</h1>
          <p className="text-muted text-sm mb-6">Something went wrong with your payment. Please try again.</p>
          <a href="#/" className="inline-flex items-center gap-2 bg-gold hover:bg-gold/80 text-white px-6 py-3 rounded-lg font-semibold text-sm transition-colors">
            <ArrowRight size={16} /> Try Again
          </a>
        </motion.div>
      </div>
    );
  }

  // ── Processing state ──
  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass max-w-md w-full p-8 text-center">
          <Clock size={64} className="text-gold mx-auto mb-4 animate-pulse" />
          <h1 className="font-display text-3xl text-white font-semibold mb-2">Processing Payment…</h1>
          <p className="text-muted text-sm">Please wait while we confirm your payment.</p>
        </motion.div>
      </div>
    );
  }

  // ── HITL Approval mode ──
  if (isHITL && reserveDetails) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 pb-12">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-gold" />
            <p className="text-gold font-mono text-xs tracking-[0.2em] uppercase">Human-in-the-Loop</p>
          </div>
          <h1 className="font-display text-3xl font-semibold text-white mb-2">Approve Agent Checkout</h1>
          <p className="text-muted text-sm mb-6">Your AI agent has prepared this order. Review and approve to proceed with payment.</p>

          <ApprovalCard
            reserveId={reserveId}
            capability={capability}
            items={reserveDetails.items ? JSON.parse(reserveDetails.items) : []}
            total={reserveDetails.max_block}
            onApproved={handleApprovalGranted}
          />

          <a href="#/" className="block text-center text-muted text-xs mt-4 hover:text-gold transition-colors">
            ← Back to Menu
          </a>
        </div>
      </div>
    );
  }

  // ── HITL loading ──
  if (isHITL && !reserveDetails) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <Clock size={32} className="text-gold animate-spin" />
      </div>
    );
  }

  // ── Regular checkout form ──
  return (
    <div className="min-h-screen bg-noir pt-20 px-6 pb-12">
      <div className="max-w-2xl mx-auto">
        <p className="text-gold font-mono text-xs tracking-[0.2em] uppercase mb-1">Checkout</p>
        <h1 className="font-display text-3xl font-semibold text-white mb-8">Complete your order</h1>

        {items.length === 0 && !order ? (
          <div className="glass p-8 text-center">
            <p className="text-muted mb-4">Your cart is empty.</p>
            <a href="#/" className="inline-flex items-center gap-2 bg-gold hover:bg-gold/80 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
              <ArrowRight size={14} /> Browse Menu
            </a>
          </div>
        ) : (
          <>
            <div className="glass p-5 mb-6">
              <h2 className="font-mono text-sm text-white uppercase tracking-wider mb-4">Order Summary</h2>
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-glass/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <img src={item.img} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                      <div>
                        <p className="text-white text-sm">{item.name}</p>
                        <p className="text-muted text-xs">Qty: {item.qty}</p>
                      </div>
                    </div>
                    <span className="text-white text-sm font-mono">₹{((item.price * item.qty)).toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-glass">
                <span className="text-muted text-sm">Total</span>
                <span className="text-white font-display text-xl font-semibold">₹{(total / 100).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleRazorpayCheckout}
                disabled={loading}
                className="flex-1 bg-gold hover:bg-gold/80 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Clock size={16} className="animate-spin" /> : null}
                Pay with Razorpay
              </button>
              <button
                onClick={handleDirectCheckout}
                disabled={loading}
                className="px-6 py-3 rounded-lg border border-glass text-muted text-sm hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
              >
                Demo Order (No Payment)
              </button>
            </div>

            <p className="text-muted text-xs text-center mt-4">
              Test mode: Use UPI ID <span className="font-mono text-gold">success@razorpay</span> for success or <span className="font-mono text-gold">failure@razorpay</span> for failure.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

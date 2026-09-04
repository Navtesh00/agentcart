import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, ArrowRight, Copy } from 'lucide-react';
import { useCart } from '../hooks/useCart.jsx';
import { toast } from 'sonner';

export default function Checkout() {
  const hashParts = window.location.hash.split('?');
  const params = new URLSearchParams(hashParts[1] || '');
  const paymentId = params.get('payment_id');
  const orderId = params.get('order_id');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(paymentId ? 'success' : orderId ? 'loading' : 'idle');
  const { items, total, clearCart } = useCart();

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

  // Direct checkout without Razorpay (demo mode)
  const handleDirectCheckout = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ id: i.id, qty: i.qty })) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrder(data.order);
      setStatus('processing');
      toast.success('Order placed! Processing payment…');

      // In real mode, open Razorpay Checkout.js popup here
      // For demo, simulate payment after 2s
      setTimeout(() => {
        setStatus('success');
        clearCart();
      }, 2000);
    } catch (e) {
      toast.error(e.message);
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  // Try Razorpay Checkout.js popup
  const handleRazorpayCheckout = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      // Create order on server
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ id: i.id, qty: i.qty })) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrder(data.order);

      // Load Razorpay Checkout.js
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
          modal: {
            ondismiss: function () {
              setStatus('cancelled');
              toast.info('Payment cancelled');
            }
          }
        });
        rzp.open();
      } else {
        // Razorpay SDK not loaded — fall back to demo mode
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

  // Checkout form
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
            {/* Order Summary */}
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

            {/* Checkout Buttons */}
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

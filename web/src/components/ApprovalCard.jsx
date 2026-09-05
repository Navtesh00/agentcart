import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Clock, AlertTriangle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

// Generate UUID v4 for idempotency_key
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export default function ApprovalCard({ reserveId, capability, items, total, onApproved }) {
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handleApprove = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setPinError('Enter the 6-digit approval PIN you received.');
      return;
    }
    setPinError('');
    setLoading(true);
    try {
      const idempotencyKey = uuidv4();

      const res = await fetch('/api/checkout/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Capability': capability,
        },
        body: JSON.stringify({
          reserve_id: reserveId,
          human_pin: pin,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      toast.success('Payment approved! Opening Razorpay…');

      // Inject system message into chat context so AI agent knows it's cleared
      window.dispatchEvent(new CustomEvent('agentcart:approval-granted', {
        detail: { reserveId, orderId: data.order?.id, idempotencyKey },
      }));

      // Open Razorpay Checkout.js popup with the approved order
      if (data.order?.razorpay_order_id && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TXPaQPvvVu85mH',
          amount: data.order.amount,
          currency: data.order.currency,
          name: 'Hotel Pranjal',
          description: `Order #${data.order.id}`,
          order_id: data.order.razorpay_order_id,
          handler: function (response) {
            toast.success('Payment successful!');
            onApproved?.({ ...data, paymentId: response.razorpay_payment_id });
          },
          prefill: { contact: '9999999999', email: 'guest@hotelpranjal.com' },
          theme: { color: '#D4A574' },
          modal: {
            ondismiss: function () {
              toast.info('Payment cancelled');
            }
          }
        });
        rzp.open();
      } else {
        // Demo fallback: simulate success
        toast.info('Demo mode — simulating payment success');
        setTimeout(() => {
          onApproved?.({ ...data, paymentId: 'demo_payment_' + Date.now() });
        }, 2000);
      }
    } catch (e) {
      toast.error(e.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-6 border border-gold/30"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
          <ShieldCheck size={20} className="text-gold" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Human Approval Required</h3>
          <p className="text-muted text-xs">Review the order, then enter the approval PIN to proceed with payment.</p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-noir/50 rounded-lg p-4 mb-4">
        <div className="space-y-2">
          {(items || []).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-white">{item.name} × {item.qty}</span>
              <span className="text-muted font-mono">₹{((item.line || item.price * item.qty) / 100).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-glass">
          <span className="text-muted text-sm">Total</span>
          <span className="text-white font-display text-lg font-semibold">₹{(total / 100).toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Reserve Info */}
      <div className="flex items-center gap-2 text-xs text-muted mb-4">
        <Clock size={12} />
        <span>Reserve: <span className="font-mono text-gold">{reserveId}</span></span>
      </div>

      {/* One-time human approval PIN */}
      <div className="bg-noir/50 rounded-lg p-4 mb-4 border border-glass">
        <label className="flex items-center gap-2 text-muted text-xs mb-2">
          <KeyRound size={13} className="text-gold" />
          One-time Approval PIN <span className="text-gold font-mono">(required)</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          autoComplete="one-time-code"
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }}
          placeholder="123456"
          className="w-full bg-noir border border-glass rounded-lg px-4 py-3 text-sm text-white placeholder-muted outline-none focus:border-gold transition-colors font-mono tracking-[0.3em]"
        />
        {pinError && (
          <p className="flex items-center gap-1 text-red-400 text-[11px] mt-2">
            <AlertTriangle size={12} /> {pinError}
          </p>
        )}
        <p className="text-muted text-[10px] mt-2">
          This PIN was sent to the order owner (out-of-band) and is required so that only a human can approve payment.
        </p>
      </div>

      {/* Approve Button */}
      <button
        onClick={handleApprove}
        disabled={loading}
        className="w-full bg-mint hover:bg-mint/80 text-noir py-3 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Clock size={16} className="animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <ShieldCheck size={16} />
            Verify PIN & Approve Payment
          </>
        )}
      </button>

      <p className="text-muted text-[10px] text-center mt-3">
        By approving, you authorize this AI agent to execute the payment using your reserved funds.
      </p>
    </motion.div>
  );
}

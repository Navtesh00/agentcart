import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ApprovalCard - Human-in-the-Loop approval UI
 * 
 * This component is used by the HUMAN to approve an agent-initiated checkout.
 * It uses a short-lived capability token (x-capability header), never the agent secret.
 * 
 * Flow:
 * 1. Human opens the checkout URL sent by the agent
 * 2. Human clicks "Show PIN" → fetches PIN via /api/approval/pin (capability-gated)
 * 3. Human enters the PIN and clicks "Approve"
 * 4. Frontend calls /api/checkout/approve with x-capability header
 * 
 * The agent NEVER sees the PIN - it's only returned by /api/approval/pin which
 * requires the capability (human's approval session).
 */
export default function ApprovalCard({ reserveId, capability, items, total, onApproved }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [humanPin, setHumanPin] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, approving, approved, error

  // Fetch the one-time PIN (capability-gated, never exposed to agent)
  const handleShowPin = async () => {
    if (!capability) {
      toast.error('Missing capability token');
      return;
    }
    setPinLoading(true);
    try {
      const res = await fetch('/api/approval/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-capability': capability,
        },
        body: JSON.stringify({ reserve_id: reserveId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve PIN');
      }
      setHumanPin(data.human_pin);
      setShowPin(true);
      toast.success('PIN retrieved. Enter it below to approve.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPinLoading(false);
    }
  };

  // Approve the checkout (capability-gated)
  const handleApprove = async () => {
    if (!capability) {
      toast.error('Missing capability token');
      return;
    }
    if (!pin || pin.length < 6) {
      toast.error('Please enter the 6-digit PIN');
      return;
    }
    setLoading(true);
    setStatus('approving');
    try {
      // Generate idempotency key for safe retries
      const idempotencyKey = `approve_${reserveId}_${Date.now()}`;
      
      const res = await fetch('/api/checkout/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-capability': capability,
        },
        body: JSON.stringify({
          reserve_id: reserveId,
          human_pin: pin,
          idempotency_key: idempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Approval failed');
      }
      setStatus('approved');
      toast.success('Checkout approved! Redirecting to payment...');
      if (onApproved) {
        onApproved(data);
      }
    } catch (e) {
      setStatus('error');
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate total from items if not provided
  const calculatedTotal = items?.reduce((sum, item) => {
    const line = item.line || (item.price * item.qty);
    return sum + line;
  }, 0) || total || 0;

  return (
    <div className="glass p-6 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={20} className="text-mint" />
        <h2 className="font-display text-xl text-white">Review & Approve</h2>
      </div>

      {/* Items list */}
      {items && items.length > 0 && (
        <div className="mb-6">
          <p className="text-muted text-xs uppercase tracking-wider mb-3">Cart Items</p>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-glass/30 last:border-0">
                <div>
                  <p className="text-white text-sm">{item.name}</p>
                  <p className="text-muted text-xs">Qty: {item.qty}</p>
                </div>
                <span className="text-white text-sm font-mono">
                  ₹{((item.line || item.price * item.qty) / 100).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-glass">
            <span className="text-muted text-sm">Total</span>
            <span className="text-white font-display text-lg font-semibold">
              ₹{(calculatedTotal / 100).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}

      {/* Status messages */}
      <AnimatePresence mode="wait">
        {status === 'approved' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-mint/10 border border-mint/30 rounded-lg p-4 mb-4"
          >
            <CheckCircle2 size={20} className="text-mint" />
            <p className="text-mint text-sm">Checkout approved! Complete payment to finish.</p>
          </motion.div>
        )}
        {status === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4"
          >
            <XCircle size={20} className="text-red-400" />
            <p className="text-red-400 text-sm">Approval failed. Please try again.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN section */}
      {status !== 'approved' && (
        <>
          {!showPin ? (
            <button
              onClick={handleShowPin}
              disabled={pinLoading}
              className="w-full bg-gold/10 hover:bg-gold/20 border border-gold/30 text-gold py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {pinLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Retrieving PIN...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Show Approval PIN
                </>
              )}
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              {/* PIN display */}
              <div className="bg-noir/50 rounded-lg p-4 text-center">
                <p className="text-muted text-xs mb-2">Your one-time approval PIN:</p>
                <p className="text-gold font-mono text-2xl tracking-widest">{humanPin}</p>
              </div>

              {/* PIN input */}
              <div>
                <label className="text-muted text-xs block mb-2">Enter PIN to approve:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit PIN"
                  className="w-full bg-noir border border-glass rounded-lg px-4 py-3 text-white text-center font-mono text-lg tracking-wider focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              {/* Approve button */}
              <button
                onClick={handleApprove}
                disabled={loading || pin.length !== 6}
                className="w-full bg-gold hover:bg-gold/80 text-white py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    Approve Checkout
                  </>
                )}
              </button>

              {/* Security note */}
              <div className="flex items-start gap-2 text-muted text-xs">
                <AlertCircle size={14} className="text-gold shrink-0 mt-0.5" />
                <p>
                  This PIN was generated when the reserve was created and is only shown to you.
                  The AI agent cannot approve this checkout without your PIN.
                </p>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* Capability warning */}
      {!capability && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
          <AlertCircle size={16} className="text-red-400" />
          <p className="text-red-400 text-xs">Missing capability token. Cannot approve without authorization.</p>
        </div>
      )}
    </div>
  );
}

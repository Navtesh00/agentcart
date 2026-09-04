import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '../hooks/useCart.jsx';

export default function CartDrawer({ open, onClose, onCheckout }) {
  const { items, updateQty, removeItem, clearCart, total, count } = useCart();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-[400px] max-w-[calc(100vw-2rem)] z-50 bg-carbon border-l border-glass flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-glass">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} className="text-gold" />
                <span className="font-display text-white font-semibold">Your Cart</span>
                <span className="text-xs font-mono text-muted bg-glass px-2 py-0.5 rounded-full">{count}</span>
              </div>
              <button onClick={onClose} className="text-muted hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag size={40} className="text-glass mx-auto mb-3" />
                  <p className="text-muted text-sm">Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-noir/50 border border-glass">
                      <img src={item.img} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.name}</p>
                        <p className="text-gold text-xs font-mono">₹{item.price}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateQty(item.id, item.qty - 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-glass text-white hover:bg-gold/20 transition-colors">
                          <Minus size={12} />
                        </button>
                        <span className="text-white text-sm font-mono w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)} className="w-7 h-7 flex items-center justify-center rounded-md bg-glass text-white hover:bg-gold/20 transition-colors">
                          <Plus size={12} />
                        </button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-muted hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-5 py-4 border-t border-glass">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-muted text-sm">Total</span>
                  <span className="text-white font-display text-lg font-semibold">₹{(total / 100).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={clearCart} className="px-4 py-2.5 rounded-lg border border-glass text-muted text-sm hover:border-red-400 hover:text-red-400 transition-colors">
                    Clear
                  </button>
                  <button onClick={onCheckout} className="flex-1 bg-gold hover:bg-gold/80 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    Checkout →
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

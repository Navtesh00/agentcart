import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Shield } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function ChatWidget({ open, onClose }) {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([
    { from: 'bot', text: 'Welcome to Hotel Pranjal. I\'m your AI Sommelier — ask me about our menu or food recommendations.' },
  ]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMsgs(m => [...m, { from: 'user', text: userMsg }]);
    setLoading(true);

    const q = userMsg.toLowerCase();

    // Simple keyword matching for demo
    if (q.includes('paneer') || q.includes('butter masala')) {
      setMsgs(m => [...m, { from: 'bot', text: 'Our Paneer Butter Masala is the bestseller — creamy paneer in rich tomato-butter gravy, just ₹280. It pairs perfectly with Tandoor Roti (₹25/pc). Would you like to order?' }]);
    } else if (q.includes('biryani') || q.includes('rice')) {
      setMsgs(m => [...m, { from: 'bot', text: 'Our Veg Biryani is fragrant basmati rice layered with saffron and garden vegetables — ₹199. Comes with raita. A complete meal!' }]);
    } else if (q.includes('thali') || q.includes('combo')) {
      setMsgs(m => [...m, { from: 'bot', text: 'The Veg Thali (Full) is our value meal — 4 curries, rice, roti, raita, and dessert for just ₹220. Or try the Dal Tadka + Jeera Rice Combo at ₹180.' }]);
    } else if (q.includes('cheap') || q.includes('budget') || q.includes('affordable')) {
      setMsgs(m => [...m, { from: 'bot', text: 'Best budget picks: Tandoor Roti ₹25, Cold Coffee ₹80, Masala Fries ₹99, Pav Bhaji ₹120. All under ₹120!' }]);
    } else if (q.includes('spicy') || q.includes('hot')) {
      setMsgs(m => [...m, { from: 'bot', text: 'For spice lovers: Pav Bhaji (Amul) ₹120, Veg Crispy Chinese ₹190, and Paneer Tikka Dry ₹260. Our Paneer Tikka is chargrilled with smoky tandoori spices.' }]);
    } else {
      setMsgs(m => [...m, { from: 'bot', text: 'I can help you with menu recommendations! Try asking about: our bestsellers, budget options, spicy dishes, biryani, thali combos, or what pairs well together.' }]);
    }
    setLoading(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)]"
        >
          <div className="glass-gold rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ height: '480px' }}>
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gold to-gold/80">
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-white" />
                <span className="font-display text-white font-semibold text-sm">AI Sommelier</span>
              </div>
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: m.from === 'user' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${m.from === 'user' ? 'bg-gold text-white' : 'bg-glass text-[#E5E5E5]'}`}>
                    {m.text}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="bg-glass rounded-xl px-3 py-2 text-sm text-muted inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
                    Thinking…
                  </div>
                </motion.div>
              )}
              <div ref={endRef} />
            </div>

            <div className="px-3 py-3 border-t border-glass">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Ask about our menu…"
                  className="flex-1 bg-noir border border-glass rounded-lg px-3 py-2 text-sm text-white placeholder-muted outline-none focus:border-gold transition-colors"
                />
                <button onClick={send} disabled={loading || !input.trim()} className="w-9 h-9 flex items-center justify-center rounded-lg bg-gold text-white disabled:opacity-40 hover:bg-gold/80 transition-colors">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

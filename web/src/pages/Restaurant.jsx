import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, CheckCircle2, Search } from 'lucide-react';
import Hero from '../components/Hero.jsx';
import DishCard from '../components/DishCard.jsx';
import CartDrawer from '../components/CartDrawer.jsx';
import ChatWidget from '../components/ChatWidget.jsx';
import { useCart } from '../hooks/useCart.jsx';

const CATEGORIES = ['All', 'Paneer', 'Rice', 'Dal', 'Pavbhaji', 'Thali', 'Rotis', 'Fries', 'Chinese', 'Mocktails'];

export default function Restaurant({ onCheckout }) {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(d => setDishes(d.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = dishes.filter(d => {
    if (activeCategory !== 'All' && d.category?.toLowerCase() !== activeCategory.toLowerCase()) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-noir">
      <Hero onOpenChat={() => setChatOpen(true)} />

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-20 border-t border-glass">
        <p className="text-gold font-mono text-xs tracking-[0.2em] uppercase mb-2">How it works</p>
        <h2 className="font-display text-3xl font-semibold text-white mb-8">Three steps to dine</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: <Search size={22} />, title: 'Browse Menu', desc: 'Explore our curated menu of authentic Indian dishes. Filter by category, search by name.' },
            { icon: <Shield size={22} />, title: 'Add to Cart', desc: 'Select your favorites, adjust quantities, and proceed to secure checkout.' },
            { icon: <CheckCircle2 size={22} />, title: 'Pay & Enjoy', desc: 'Checkout securely via Razorpay. UPI, cards, netbanking — all supported.' },
          ].map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass p-6"
            >
              <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center text-gold mb-4">{step.icon}</div>
              <h3 className="font-display text-white font-semibold mb-2">{step.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Menu Grid */}
      <section id="menu" className="max-w-6xl mx-auto px-6 py-20">
        <p className="text-gold font-mono text-xs tracking-[0.2em] uppercase mb-2">Our Menu</p>
        <h2 className="font-display text-4xl font-semibold text-white mb-6">Curated for you</h2>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search dishes..."
              className="w-full bg-glass border border-glass rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-muted outline-none focus:border-gold transition-colors"
            />
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
                activeCategory === cat
                  ? 'bg-gold text-white'
                  : 'bg-glass text-muted hover:text-white hover:bg-glass/80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass rounded-xl overflow-hidden animate-pulse">
                <div className="h-44 bg-glass" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-glass rounded w-3/4" />
                  <div className="h-3 bg-glass rounded w-full" />
                  <div className="h-8 bg-glass rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filtered.map(dish => (
              <DishCard key={dish.id} dish={dish} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-muted text-center py-12">No dishes found matching your criteria.</p>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-glass py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-between gap-4 text-sm text-muted">
          <span>© Hotel Pranjal — AgentCart powered by Razorpay</span>
          <div className="flex gap-4">
            <a href="/llms.txt" className="hover:text-gold transition-colors">/llms.txt</a>
            <a href="/api/catalog" className="hover:text-gold transition-colors">/api/catalog</a>
            <a href="/api/health" className="hover:text-gold transition-colors">/api/health</a>
          </div>
        </div>
      </footer>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onCheckout={() => { setCartOpen(false); onCheckout(); }} />
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />

      {/* Floating cart button */}
      <CartFAB onClick={() => setCartOpen(true)} />
    </div>
  );
}

function CartFAB({ onClick }) {
  const { count } = useCart();
  if (count === 0) return null;
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 bg-gold hover:bg-gold/80 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors"
    >
      <span className="font-mono text-sm font-bold">{count}</span>
    </motion.button>
  );
}

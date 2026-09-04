import { motion } from 'framer-motion';
import { ArrowRight, Bot } from 'lucide-react';

export default function Hero({ onOpenChat }) {
  return (
    <section className="relative h-screen min-h-[600px] flex items-end overflow-hidden">
      <img
        src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80"
        alt="Restaurant interior"
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-noir via-noir/60 to-transparent" />
      <div className="relative z-10 max-w-5xl mx-auto px-6 pb-16 w-full">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-gold font-mono text-xs tracking-[0.2em] uppercase mb-3"
        >
          Hotel Pranjal · Pure Veg · Est. 2026
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="font-display text-5xl md:text-7xl font-semibold text-white leading-tight mb-4"
        >
          Every reservation,<br />powered by AI.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-muted text-lg max-w-xl mb-6 leading-relaxed"
        >
          Browse our menu, add to cart, and checkout securely with Razorpay. Your food, delivered fast.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex gap-3 flex-wrap"
        >
          <a href="#menu" className="inline-flex items-center gap-2 bg-gold hover:bg-gold/80 text-white px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-colors">
            View Menu <ArrowRight size={16} />
          </a>
          <button onClick={onOpenChat} className="inline-flex items-center gap-2 border border-gold/50 text-gold hover:bg-gold/10 px-6 py-3 rounded-lg font-semibold text-sm tracking-wide transition-colors">
            <Bot size={16} /> Talk to AI Sommelier
          </button>
        </motion.div>
      </div>
    </section>
  );
}

import { motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { useCart } from '../hooks/useCart.jsx';
import { toast } from 'sonner';

export default function DishCard({ dish }) {
  const { addItem } = useCart();

  const handleAdd = () => {
    addItem(dish);
    toast.success(`${dish.name} added to cart`, { duration: 2000 });
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="glass rounded-xl overflow-hidden group"
    >
      <div className="relative h-44 overflow-hidden">
        <img
          src={dish.img}
          alt={dish.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute top-3 right-3 bg-noir/80 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-mono text-gold font-semibold">
          ₹{dish.price}
        </div>
        {dish.veg && (
          <div className="absolute top-3 left-3 w-4 h-4 border-2 border-green-500 rounded-sm flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-white font-semibold text-base mb-1">{dish.name}</h3>
        <p className="text-muted text-sm leading-relaxed mb-3 line-clamp-2">{dish.desc}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdd}
            className="flex-1 flex items-center justify-center gap-2 bg-glass hover:bg-gold text-white border border-glass hover:border-gold rounded-lg py-2 text-sm font-medium transition-all duration-200"
          >
            <Plus size={14} /> Add to Cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}

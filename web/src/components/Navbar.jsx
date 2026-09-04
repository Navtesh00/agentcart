import { UtensilsCrossed } from 'lucide-react';
import clsx from 'clsx';

export default function Navbar({ view }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-6 py-3 bg-noir/80 backdrop-blur-md border-b border-glass">
      <a href="#/" className="flex items-center gap-2 font-display text-lg font-semibold text-white tracking-wide">
        <UtensilsCrossed size={20} className="text-gold" />
        Hotel Pranjal
      </a>
      <div className="flex items-center gap-5">
        <a href="#/" className={clsx('text-xs font-mono uppercase tracking-wider transition-colors', view === 'restaurant' ? 'text-gold' : 'text-muted hover:text-white')}>
          Menu
        </a>
        <a href="#/dashboard" className={clsx('text-xs font-mono uppercase tracking-wider transition-colors', view === 'dashboard' ? 'text-gold' : 'text-muted hover:text-white')}>
          Dashboard
        </a>
      </div>
    </nav>
  );
}

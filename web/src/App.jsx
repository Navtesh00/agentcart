import { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import Restaurant from './pages/Restaurant.jsx';
import Checkout from './pages/Checkout.jsx';
import AgentDashboard from './pages/AgentDashboard.jsx';
import { CartProvider } from './hooks/useCart.jsx';

function getRoute() {
  const hash = window.location.hash || '#/';
  if (hash.startsWith('#/dashboard')) return 'dashboard';
  if (hash.startsWith('#/checkout')) return 'checkout';
  return 'restaurant';
}

export default function App() {
  const [view, setView] = useState(getRoute);

  useEffect(() => {
    const onHash = () => setView(getRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <CartProvider>
      <Navbar view={view} />
      {view === 'dashboard' && <AgentDashboard />}
      {view === 'checkout' && <Checkout />}
      {view === 'restaurant' && <Restaurant onCheckout={() => { window.location.hash = '#/checkout'; }} />}
    </CartProvider>
  );
}

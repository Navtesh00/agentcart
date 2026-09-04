import React, { createContext, useContext, useState, useCallback } from 'react';

const CartCtx = createContext();

export function useCart() {
  return useContext(CartCtx);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addItem = useCallback((dish) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === dish.id);
      if (existing) return prev.map(i => i.id === dish.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: dish.id, name: dish.name, price: dish.price, img: dish.img, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQty = useCallback((id, qty) => {
    if (qty < 1) return setItems(prev => prev.filter(i => i.id !== id));
    setItems(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = items.reduce((s, i) => s + i.price * 100 * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartCtx.Provider value={{ items, addItem, removeItem, updateQty, clearCart, total, count }}>
      {children}
    </CartCtx.Provider>
  );
}

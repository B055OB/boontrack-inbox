'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CartRecord, CartItemRecord, CartItemInput } from './cart-types';

const SESSION_STORAGE_KEY = 'bt_cart_session_id';

export function getOrCreateCartSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

export function useCart(tenantSlug: string) {
  const [cart, setCart] = useState<CartRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    sessionIdRef.current = getOrCreateCartSessionId();
  }, []);

  const fetchCart = useCallback(async () => {
    if (!tenantSlug) return;
    const sessId = sessionIdRef.current || getOrCreateCartSessionId();

    try {
      setLoading(true);
      const res = await fetch(`/api/v1/cart?tenant=${encodeURIComponent(tenantSlug)}&session_id=${encodeURIComponent(sessId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.cart) {
          setCart(data.cart);
        }
      }
    } catch (err) {
      console.warn('[useCart] Error fetching cart:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addItem = async (item: CartItemInput) => {
    if (!tenantSlug) return;
    const sessId = sessionIdRef.current || getOrCreateCartSessionId();

    try {
      setLoading(true);
      const res = await fetch('/api/v1/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          session_id: sessId,
          item,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.cart) {
          setCart(data.cart);
        }
      }
    } catch (err) {
      console.warn('[useCart] Error adding item to cart:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (!cart?.id || !tenantSlug) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart_id: cart.id,
          tenant_slug: tenantSlug,
          quantity,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.cart) {
          setCart(data.cart);
        }
      }
    } catch (err) {
      console.warn('[useCart] Error updating item quantity:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!cart?.id || !tenantSlug) return;

    try {
      setLoading(true);
      const res = await fetch(
        `/api/v1/cart/items/${encodeURIComponent(itemId)}?cart_id=${encodeURIComponent(cart.id)}&tenant=${encodeURIComponent(tenantSlug)}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.cart) {
          setCart(data.cart);
        }
      }
    } catch (err) {
      console.warn('[useCart] Error removing item:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalQuantity = cart?.total_quantity || 0;
  const subtotal = cart?.subtotal || 0;
  const totalWeightGrams = cart?.total_weight_grams || 0;
  const items = cart?.items || [];

  return {
    cart,
    items,
    totalQuantity,
    subtotal,
    totalWeightGrams,
    loading,
    isDrawerOpen,
    openCart: () => setIsDrawerOpen(true),
    closeCart: () => setIsDrawerOpen(false),
    toggleCart: () => setIsDrawerOpen((prev) => !prev),
    addItem,
    updateQuantity,
    removeItem,
    refreshCart: fetchCart,
  };
}

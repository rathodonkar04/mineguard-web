/**
 * MineGuard Service Worker Registration & Network Event Monitor
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

import { flushOutboxActions } from './offlineStore';

export function registerServiceWorker(onOnlineChange = null) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // console.log('[ServiceWorker] Registered with scope:', registration.scope);
      })
      .catch((err) => {
        console.warn('[ServiceWorker] Registration failed:', err);
      });
  });

  // Listen to network status transitions
  window.addEventListener('online', () => {
    console.log('📶 [Network] Connection restored! Flushing offline outbox actions...');
    flushOutboxActions();
    if (onOnlineChange) onOnlineChange(true);
  });

  window.addEventListener('offline', () => {
    console.warn('⚠️ [Network] Pithead connection lost. Switching to IndexedDB offline cache...');
    if (onOnlineChange) onOnlineChange(false);
  });
}

'use client';

import { useEffect, useState } from 'react';

/**
 * Registra el service worker y, cuando hay una versión nueva esperando, muestra un aviso
 * discreto para recargar (así nadie se queda con una versión antigua en caché).
 */
export default function RegisterServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
    }).catch(() => { /* noop */ });
  }, []);

  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-[13.5px] shadow-lg">
      <span>Hay una versión nueva de la app.</span>
      <button
        type="button"
        className="rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground"
        onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}
      >
        Actualizar
      </button>
    </div>
  );
}

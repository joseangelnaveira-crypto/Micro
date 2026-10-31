'use client';

import { useEffect, useState } from 'react';

// Firma que Chromium expone para el prompt de instalación de PWA.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Estado de "instalar app". Un solo hook, un solo par de listeners: la cabecera lo usa
 * tanto para el botón de escritorio como para la fila del menú móvil.
 * - Chromium: captura beforeinstallprompt y lo lanza desde promptInstall().
 * - iOS Safari: no expone ese evento, así que promptInstall() abre las instrucciones
 *   manuales (showIosHint) de "Compartir -> Añadir a pantalla de inicio".
 */
export function useInstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function promptInstall() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setDeferred(null);
      return;
    }
    if (isIos) setShowIosHint(true);
  }

  return {
    canInstall: !installed && (!!deferred || isIos),
    promptInstall,
    showIosHint,
    closeIosHint: () => setShowIosHint(false),
  };
}

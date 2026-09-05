'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Share } from 'lucide-react';

// Firma que Chromium expone para el prompt de instalación de PWA.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const IOS_HINT_DISMISSED_KEY = 'academia_ios_install_hint_dismissed';

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      // Safari mete `standalone` en el navigator cuando la PWA se abre instalada.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }

    const ua = window.navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIos(ios);

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (isIos) setShowIosHint(true);
  }

  function dismissIosHint() {
    setShowIosHint(false);
    try { localStorage.setItem(IOS_HINT_DISMISSED_KEY, '1'); } catch { /* noop */ }
  }

  // Ocultar si ya está instalada o si no hay forma de mostrar el prompt en este navegador
  // (p. ej. escritorio sin PWA install prompt disponible), salvo iOS que sí necesita el botón.
  if (installed) return null;
  if (!deferredPrompt && !isIos) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="auto"
        onClick={handleClick}
        className="gap-1.5"
        title="Instalar como aplicación"
      >
        <Download className="size-4" />
        Instalar app
      </Button>

      <Dialog open={showIosHint} onOpenChange={(open) => { if (!open) dismissIosHint(); }}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Instalar en iPhone/iPad</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <p>Safari no permite instalar la app con un botón, hay que hacerlo a mano:</p>
            <ol className="ml-5 list-decimal space-y-1.5 text-foreground">
              <li>Pulsa el botón <Share className="inline size-4 align-text-bottom" /> <strong>Compartir</strong> abajo (o arriba en iPad).</li>
              <li>Baja hasta <strong>&ldquo;Añadir a pantalla de inicio&rdquo;</strong>.</li>
              <li>Pulsa <strong>Añadir</strong>.</li>
            </ol>
            <p>La app aparecerá como un icono en tu pantalla de inicio y funcionará sin conexión.</p>
          </div>
          <DialogFooter>
            <Button type="button" size="auto" onClick={dismissIosHint}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

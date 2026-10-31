'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useInstallPWA } from '@/lib/use-install-pwa';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { IconPetri } from '@/components/Icons';
import { cn } from '@/lib/utils';
import {
  Search, Flame, Bell, BellOff, Moon, Sun, LogOut, Download, Share, Shield,
  LayoutDashboard, BarChart3, History as HistoryIcon,
} from 'lucide-react';
import type { StreakInfo } from '@/app/dashboard/actions';

export type HeaderTarget = 'home' | 'stats' | 'history';

type Props = {
  isAdmin: boolean;
  streak: StreakInfo | null;
  darkMode: boolean;
  onToggleDark: () => void;
  remindersEnabled: boolean;
  remindersBusy: boolean;
  onToggleReminders: () => void;
  onOpenSearch: () => void;
  onNavigate: (target: HeaderTarget) => void;
};

const NAV: { target: HeaderTarget; label: string; icon: React.ReactNode }[] = [
  { target: 'home', label: 'Inicio', icon: <LayoutDashboard className="size-[18px]" /> },
  { target: 'stats', label: 'Estadísticas', icon: <BarChart3 className="size-[18px]" /> },
  { target: 'history', label: 'Historial', icon: <HistoryIcon className="size-[18px]" /> },
];

export default function DashboardHeader({
  isAdmin, streak, darkMode, onToggleDark, remindersEnabled, remindersBusy,
  onToggleReminders, onOpenSearch, onNavigate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const install = useInstallPWA();

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 8); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  // Si se agranda la ventana a escritorio con el menú abierto, lo cerramos.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    function onChange() { if (mq.matches) setOpen(false); }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  async function handleSignOut() {
    await createClient().auth.signOut();
    window.location.href = '/login';
  }

  function go(target: HeaderTarget) {
    setOpen(false);
    onNavigate(target);
  }

  const streakChip = streak && streak.current > 0 && (
    <button
      type="button"
      onClick={() => go('stats')}
      className="flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2.5 py-1 text-[12px] font-bold text-[#8a5a00] transition-colors hover:bg-warning/20 dark:text-warning"
      title={streak.todayDone ? `${streak.current} días seguidos estudiando — ¡sigue así!` : `${streak.current} días seguidos. Hoy aún no has estudiado.`}
    >
      <Flame className={cn('size-3.5', streak.todayDone && 'fill-current')} />
      {streak.current}
    </button>
  );

  const menuRow = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-accent active:bg-accent';
  const menuIcon = 'flex size-8 flex-none items-center justify-center rounded-lg bg-secondary/10 text-secondary';

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] md:hidden anim-fade"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <header
        className={cn(
          'sticky top-0 z-50 border-b transition-all duration-300',
          scrolled
            ? 'border-border bg-background/85 shadow-[var(--shadow-paper)] backdrop-blur-xl'
            : 'border-transparent bg-background/60 backdrop-blur-md'
        )}
      >
        <div className="mx-auto flex h-14 max-w-[1040px] items-center justify-between gap-3 px-3.5 md:h-16 md:px-5">
          <button
            type="button"
            onClick={() => go('home')}
            className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            aria-label="Ir al inicio"
          >
            <span className="text-secondary"><IconPetri /></span>
            <span className="font-display truncate text-[19px] italic leading-none md:text-xl">Academia de Microbiología</span>
          </button>

          {/* ---- Menú de escritorio ---- */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {NAV.map(item => (
              <button
                key={item.target}
                type="button"
                onClick={() => go(item.target)}
                className="rounded-full px-3.5 py-2 text-[14px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                {item.label}
              </button>
            ))}
            {isAdmin && (
              <a
                href="/admin"
                className="rounded-full px-3.5 py-2 text-[14px] font-semibold text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                Administración
              </a>
            )}
          </nav>

          <div className="flex items-center gap-1.5 md:gap-2 [&>*]:shrink-0">
            <span className="hidden md:block">{streakChip}</span>
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={onOpenSearch} title="Buscar (Ctrl+K)" aria-label="Buscar">
              <Search className="size-4" />
            </Button>

            {/* Acciones sueltas solo en escritorio; en móvil van dentro del menú */}
            <div className="hidden items-center gap-2 md:flex [&>*]:shrink-0">
              {install.canInstall && (
                <Button type="button" variant="outline" size="icon" onClick={install.promptInstall} title="Instalar como aplicación" aria-label="Instalar app">
                  <Download className="size-4" />
                </Button>
              )}
              <Button
                type="button" variant="outline" size="icon" disabled={remindersBusy} onClick={onToggleReminders}
                title={remindersEnabled ? 'Desactivar recordatorios' : 'Avisarme si dejo de estudiar'}
                aria-label="Recordatorios"
              >
                {remindersEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={onToggleDark} title={darkMode ? 'Modo claro' : 'Modo oscuro'} aria-label="Cambiar tema">
                {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button type="button" variant="ghost" size="auto" onClick={handleSignOut}>
                <LogOut className="size-4" />
                Salir
              </Button>
            </div>

            {/* Hamburguesa (cuadrada, las 3 rayas se transforman en X) */}
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              className="relative flex size-10 flex-none items-center justify-center rounded-[10px] border border-input bg-card outline-none transition-colors hover:border-secondary/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 md:hidden"
            >
              <span className="sr-only">Menú</span>
              <span className={cn('absolute h-[2px] w-[18px] rounded-full bg-foreground transition-all duration-300', open ? 'rotate-45' : '-translate-y-[6px]')} />
              <span className={cn('absolute h-[2px] w-[18px] rounded-full bg-foreground transition-all duration-300', open ? 'scale-x-0 opacity-0' : 'opacity-100')} />
              <span className={cn('absolute h-[2px] w-[18px] rounded-full bg-foreground transition-all duration-300', open ? '-rotate-45' : 'translate-y-[6px]')} />
            </button>
          </div>
        </div>

        {/* ---- Panel del menú móvil ---- */}
        {open && (
          <div className="absolute inset-x-0 top-full md:hidden">
            <div className="anim-menu mx-2 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-[var(--shadow-paper-lift)]">
              {streakChip && <div className="px-3 pt-2 pb-1">{streakChip}</div>}

              {NAV.map(item => (
                <button key={item.target} type="button" className={menuRow} onClick={() => go(item.target)}>
                  <span className={menuIcon}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <button type="button" className={menuRow} onClick={() => { setOpen(false); onOpenSearch(); }}>
                <span className={menuIcon}><Search className="size-[18px]" /></span>
                Buscar
              </button>

              <div className="my-2 h-px bg-border" />

              {install.canInstall && (
                <button type="button" className={menuRow} onClick={() => { setOpen(false); install.promptInstall(); }}>
                  <span className={menuIcon}><Download className="size-[18px]" /></span>
                  Instalar app
                </button>
              )}
              <button type="button" className={menuRow} disabled={remindersBusy} onClick={onToggleReminders}>
                <span className={menuIcon}>{remindersEnabled ? <Bell className="size-[18px]" /> : <BellOff className="size-[18px]" />}</span>
                <span className="flex-1">Recordatorios</span>
                <span className="text-[12.5px] font-medium text-muted-foreground">{remindersEnabled ? 'Activados' : 'Desactivados'}</span>
              </button>
              <button type="button" className={menuRow} onClick={onToggleDark}>
                <span className={menuIcon}>{darkMode ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}</span>
                <span className="flex-1">Tema</span>
                <span className="text-[12.5px] font-medium text-muted-foreground">{darkMode ? 'Oscuro' : 'Claro'}</span>
              </button>
              {isAdmin && (
                <a href="/admin" className={menuRow}>
                  <span className={menuIcon}><Shield className="size-[18px]" /></span>
                  Administración
                </a>
              )}

              <div className="my-2 h-px bg-border" />

              <button type="button" className={cn(menuRow, 'text-destructive hover:bg-destructive/10')} onClick={handleSignOut}>
                <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <LogOut className="size-[18px]" />
                </span>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Instrucciones de instalación en iOS (Safari no tiene prompt propio) */}
      <Dialog open={install.showIosHint} onOpenChange={(o) => { if (!o) install.closeIosHint(); }}>
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
            <Button type="button" size="auto" onClick={install.closeIosHint}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

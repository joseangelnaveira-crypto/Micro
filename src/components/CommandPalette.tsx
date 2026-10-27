'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, FlaskConical, History, BarChart3, Flag, Zap, Moon, Sun, Bell, LogOut } from 'lucide-react';
import type { Question } from '@/lib/exam-types';

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  onRun: () => void;
};

export type PaletteSearchResult = {
  type: 'question';
  id: string;
  title: string;
  subtitle: string;
};

export default function CommandPalette({
  open,
  onOpenChange,
  actions,
  onSearch,
  onOpenQuestion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PaletteAction[];
  onSearch: (query: string) => Promise<Question[]>;
  onOpenQuestion?: (q: Question) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Question[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      // Enfoca el input al abrir
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Búsqueda con debounce muy corto para no bombardear al servidor
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await onSearch(q);
        setResults(found.slice(0, 8));
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, onSearch]);

  // Lista combinada: acciones filtradas por query + resultados de preguntas
  const filteredActions = query.trim().length === 0
    ? actions
    : actions.filter(a => a.label.toLowerCase().includes(query.trim().toLowerCase()));

  const items: Array<
    | { kind: 'action'; action: PaletteAction }
    | { kind: 'question'; question: Question }
  > = [
    ...filteredActions.map(a => ({ kind: 'action' as const, action: a })),
    ...results.map(q => ({ kind: 'question' as const, question: q })),
  ];

  function runItem(idx: number) {
    const item = items[idx];
    if (!item) return;
    if (item.kind === 'action') {
      item.action.onRun();
      onOpenChange(false);
    } else {
      onOpenQuestion?.(item.question);
      onOpenChange(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')   { e.preventDefault(); runItem(activeIndex); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] left-1/2 w-[min(92vw,560px)] max-w-none -translate-x-1/2 translate-y-0 gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKey}
            placeholder="Buscar preguntas o acciones…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-mono text-muted-foreground sm:inline-block">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {items.length === 0 && query.trim().length < 2 && (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Escribe para buscar preguntas, temas o acciones.
            </p>
          )}
          {items.length === 0 && query.trim().length >= 2 && !searching && (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              Nada coincide con &ldquo;{query}&rdquo;.
            </p>
          )}
          {searching && items.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Buscando…</p>
          )}

          {filteredActions.length > 0 && (
            <div className="px-2 pt-2">
              <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Acciones</p>
              {filteredActions.map((a, i) => {
                const idx = i; // acciones vienen primero en items
                const active = idx === activeIndex;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runItem(idx)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[14px] transition-colors ${active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'}`}
                  >
                    <span className="flex size-5 flex-none items-center justify-center text-muted-foreground">
                      {a.icon}
                    </span>
                    <span className="flex-1">{a.label}</span>
                    {a.hint && <span className="font-mono text-[11px] text-muted-foreground">{a.hint}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {results.length > 0 && (
            <div className="px-2 pt-2 pb-2">
              <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Preguntas</p>
              {results.map((q, i) => {
                const idx = filteredActions.length + i;
                const active = idx === activeIndex;
                const key = `option_${q.correct.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
                return (
                  <button
                    key={q.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runItem(idx)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'}`}
                  >
                    <span className="line-clamp-2 text-[13.5px] leading-snug">{q.question}</span>
                    <span className="line-clamp-1 text-[11.5px] text-muted-foreground">
                      ✓ {q.correct}) {q[key]} · {q.topic}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ para navegar · ↵ para abrir</span>
          <span className="font-mono">⌘K / Ctrl+K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-exportamos iconos útiles que la pantalla principal puede usar al construir sus acciones.
export const CmdIcons = { FlaskConical, History, BarChart3, Flag, Zap, Moon, Sun, Bell, LogOut, Search };

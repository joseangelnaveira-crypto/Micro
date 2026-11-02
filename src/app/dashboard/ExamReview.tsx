'use client';

import { useMemo, useState } from 'react';
import { Check, X, Flag } from 'lucide-react';
import type { Question } from '@/lib/exam-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import QuestionText from '@/components/QuestionText';
import QuestionNote from '@/components/QuestionNote';
import { cn } from '@/lib/utils';

export type ReviewItem = { question: Question; selected: string | null; isCorrect: boolean };
type Filter = 'falladas' | 'blanco' | 'marcadas' | 'todas';

/**
 * Revisión de un examen terminado: todas las preguntas en el orden del examen, con filtros
 * (falladas / en blanco / marcadas / todas), tus respuestas, la explicación, la fuente y tu nota.
 */
export default function ExamReview({
  items, flaggedIds, canTakeNotes,
}: {
  items: ReviewItem[];
  flaggedIds: Set<string>;
  canTakeNotes: boolean;
}) {
  const counts = useMemo(() => ({
    falladas: items.filter(i => i.selected !== null && !i.isCorrect).length,
    blanco: items.filter(i => i.selected === null).length,
    marcadas: items.filter(i => flaggedIds.has(i.question.id)).length,
    todas: items.length,
  }), [items, flaggedIds]);

  const [filter, setFilter] = useState<Filter>(counts.falladas + counts.blanco > 0 ? 'falladas' : 'todas');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const visible = items.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (filter === 'falladas') return item.selected !== null && !item.isCorrect;
    if (filter === 'blanco') return item.selected === null;
    if (filter === 'marcadas') return flaggedIds.has(item.question.id);
    return true;
  });

  const tabs: { id: Filter; label: string }[] = [
    { id: 'falladas', label: 'Falladas' },
    { id: 'blanco', label: 'En blanco' },
    { id: 'marcadas', label: 'Marcadas' },
    { id: 'todas', label: 'Todas' },
  ];

  function toggle(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="font-display mb-3 text-[19px] italic">Revisión del examen</h2>
        <div role="tablist" aria-label="Filtro de preguntas" className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              variant={filter === tab.id ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setFilter(tab.id)}
            >
              {tab.label} <span className="ml-1 font-mono text-[11px] opacity-80">{counts[tab.id]}</span>
            </Button>
          ))}
        </div>

        {visible.length === 0 && (
          <p className="py-4 text-[13.5px] text-muted-foreground">
            {filter === 'falladas' ? 'No has fallado ninguna pregunta.' : filter === 'blanco' ? 'No has dejado ninguna en blanco.' : 'No hay preguntas marcadas.'}
          </p>
        )}

        {visible.map(({ item, index }) => {
          const q = item.question;
          const opts: [string, string][] = [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]];
          const open = openIds.has(q.id) || filter !== 'todas';
          const status = item.selected === null ? 'blanco' : item.isCorrect ? 'ok' : 'ko';
          return (
            <div key={q.id + index} className="border-t border-border/60 py-4 first:border-t-0 first:pt-0">
              <button
                type="button"
                className="flex w-full items-start gap-2.5 text-left"
                aria-expanded={open}
                onClick={() => toggle(q.id)}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold',
                    status === 'ok' && 'bg-success text-success-foreground',
                    status === 'ko' && 'bg-destructive text-destructive-foreground',
                    status === 'blanco' && 'bg-muted text-muted-foreground'
                  )}
                  aria-label={status === 'ok' ? 'Acertada' : status === 'ko' ? 'Fallada' : 'En blanco'}
                >
                  {status === 'ok' ? <Check className="size-3.5" strokeWidth={3} /> : status === 'ko' ? <X className="size-3.5" strokeWidth={3} /> : '–'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block font-mono text-[11px] text-muted-foreground">
                    Pregunta {index + 1} · {q.topic}
                    {flaggedIds.has(q.id) && <Flag className="ml-1.5 inline size-3 fill-warning text-warning" aria-label="Marcada" />}
                  </span>
                  <QuestionText text={q.question} className="text-[15px] font-semibold leading-snug" caseClassName="mb-2" />
                </span>
              </button>

              {open && (
                <div className="mt-3 pl-0 sm:pl-[34px]">
                  <div className="flex flex-col gap-1.5">
                    {opts.map(([letter, text]) => {
                      const isCorrect = letter === q.correct;
                      const isMine = letter === item.selected;
                      return (
                        <div
                          key={letter}
                          className={cn(
                            'flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13.5px] leading-snug',
                            isCorrect ? 'border-success bg-success/10' : isMine ? 'border-destructive bg-destructive/10' : 'border-border/70'
                          )}
                        >
                          <b className="font-mono text-[12px]">{letter}</b>
                          <span className="flex-1">{text}</span>
                          {isCorrect && <span className="text-[11.5px] font-bold text-success">Correcta</span>}
                          {isMine && !isCorrect && <span className="text-[11.5px] font-bold text-destructive">Tu respuesta</span>}
                        </div>
                      );
                    })}
                  </div>
                  {item.selected === null && <p className="mt-1.5 text-[12.5px] text-muted-foreground">La dejaste en blanco.</p>}
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
                    {q.explanation || 'Sin explicación disponible.'}
                  </p>
                  {(q.source_page || q.source_url) && (
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                      {q.source_page && <span>Murray, Microbiología Médica 9.ª ed. · pág. {q.source_page}</span>}
                      {q.source_url && (
                        <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="ml-3 font-semibold text-secondary hover:underline">
                          Leer más ↗
                        </a>
                      )}
                    </p>
                  )}
                  <QuestionNote questionId={q.id} disabled={!canTakeNotes} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

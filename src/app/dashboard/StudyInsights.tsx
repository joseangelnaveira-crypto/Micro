'use client';

import type { StudyStats } from './actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function tone(accuracy: number) {
  if (accuracy >= 75) return { bar: 'bg-success', text: 'text-success' };
  if (accuracy >= 50) return { bar: 'bg-warning', text: 'text-foreground' };
  return { bar: 'bg-destructive', text: 'text-destructive' };
}

/**
 * Dominio por temas (aciertos y cobertura del banco) y previsión de cuántas preguntas habrás visto
 * el día de la convocatoria si mantienes el ritmo de las dos últimas semanas.
 */
export default function StudyInsights({
  stats, busy, onPractice,
}: {
  stats: StudyStats;
  busy: boolean;
  onPractice: (topic: string) => void;
}) {
  const cov = stats.coverage;
  const coveragePct = cov && cov.totalQuestions ? Math.round((cov.seenQuestions / cov.totalQuestions) * 100) : 0;

  return (
    <div className="mt-2">
      {cov && (
        <div className="mb-5 rounded-2xl border border-border bg-background/50 p-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">Banco visto</span>
            <span className="font-mono text-[12.5px] text-muted-foreground">
              {cov.seenQuestions.toLocaleString('es-ES')} / {cov.totalQuestions.toLocaleString('es-ES')} · {coveragePct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje del banco visto">
            <div className="anim-bar h-full rounded-full bg-secondary" style={{ width: `${Math.max(coveragePct, coveragePct > 0 ? 2 : 0)}%` }} />
          </div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Ritmo de las últimas dos semanas: <b className="text-foreground">{cov.newPerDay.toLocaleString('es-ES')}</b> preguntas nuevas al día.
            {cov.projected !== null && cov.daysLeft !== null ? (
              <>
                {' '}A este ritmo, el día de la convocatoria (en {cov.daysLeft} días) habrás visto{' '}
                <b className="text-foreground">{cov.projected.toLocaleString('es-ES')}</b> de {cov.totalQuestions.toLocaleString('es-ES')}
                {' '}({Math.round((cov.projected / Math.max(1, cov.totalQuestions)) * 100)}%).
              </>
            ) : (
              <> Añade la fecha de tu convocatoria para ver la previsión.</>
            )}
          </p>
        </div>
      )}

      {stats.topicRows.length > 0 && (
        <>
          <p className="mb-2 text-[13.5px] text-muted-foreground">
            <strong>Dominio por temas</strong> — del más flojo al más fuerte. Barra = % de aciertos; a la derecha, preguntas vistas del tema.
          </p>
          <div className="flex flex-col gap-3">
            {stats.topicRows.map((r, idx) => {
              const c = tone(r.accuracy);
              return (
                <div key={r.topic} className="anim-fade-up" style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={r.topic}>{r.topic}</span>
                    <span className="flex flex-none items-center gap-2">
                      <b className={cn('font-mono text-[13px]', c.text)}>{r.accuracy}%</b>
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onPractice(r.topic)}>
                        Practicar
                      </Button>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={r.accuracy} aria-valuemin={0} aria-valuemax={100} aria-label={`Aciertos en ${r.topic}`}>
                    <div className={cn('anim-bar h-full rounded-full', c.bar)} style={{ width: `${Math.max(r.accuracy, 2)}%` }} />
                  </div>
                  <p className="mt-0.5 text-right font-mono text-[11px] text-muted-foreground">
                    {r.seenQuestions}/{r.totalQuestions} vistas · {r.answers} respuestas
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

// Piezas de presentación pequeñas y sin estado de la pantalla principal (DashboardApp.tsx).
// Separadas para que DashboardApp.tsx se quede solo con el estado y el flujo del examen.
import type { Question, ExamAttempt } from '@/lib/exam-types';
import AnimatedNumber from '@/components/AnimatedNumber';
import { cn } from '@/lib/utils';

export function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function examComposition(questions: Question[]) {
  const counts = new Map<string, number>();
  questions.forEach(q => counts.set(q.source, (counts.get(q.source) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function StatBlock({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="font-mono">
      <b className="block text-[23px] font-bold leading-none tracking-tight tabular-nums">
        {value === null ? <span className="skeleton inline-block h-[23px] w-14 align-top" aria-label="Cargando" /> : typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </b>
      <span className="text-[10.5px] uppercase tracking-[1px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function CompositionTags({ composition, className }: { composition: [string, number][]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {composition.map(([s, cnt]) => (
        <span key={s} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {s} <b className="font-mono text-foreground">{cnt}</b>
        </span>
      ))}
    </div>
  );
}

export function TrendChart({ history }: { history: ExamAttempt[] }) {
  const chrono = history.slice().reverse();
  const n = chrono.length;
  if (n < 2) return null;

  const W = 640, H = 220, padL = 34, padR = 14, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (pct: number) => padT + plotH - (pct / 100) * plotH;

  const scores = chrono.map(e => e.score);
  const windowSize = 5;
  const movingAvg = scores.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = scores.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const avgPassMark = Math.round(chrono.reduce((s, e) => s + e.pass_mark, 0) / n);

  const scoreLine = chrono.map((e, i) => `${x(i).toFixed(1)},${y(e.score).toFixed(1)}`).join(' ');
  const avgLine = movingAvg.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const firstDate = new Date(chrono[0].created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  const lastDate = new Date(chrono[n - 1].created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

  // Frase interpretativa: compara la media móvil actual con la nota de corte media
  // y con la de hace unos exámenes, para dar contexto en vez de solo dibujar la línea.
  const insight = (() => {
    const currentAvg = Math.round(movingAvg[movingAvg.length - 1]);
    const diff = currentAvg - avgPassMark;
    const passing = diff >= 0;
    const cushion = Math.abs(diff);

    let trendText = '';
    if (n >= 6) {
      const earlierAvg = Math.round(movingAvg[Math.max(0, movingAvg.length - 6)]);
      const delta = currentAvg - earlierAvg;
      if (delta >= 3) trendText = ` Vas mejorando (+${delta} puntos frente a hace unos exámenes).`;
      else if (delta <= -3) trendText = ` Estás bajando (${delta} puntos frente a hace unos exámenes).`;
      else trendText = ' Vas estable en las últimas semanas.';
    }

    const cushionText = passing
      ? `Tu media de los últimos 5 exámenes (${currentAvg}%) supera la nota de corte media (${avgPassMark}%) por ${cushion} puntos.`
      : `Tu media de los últimos 5 exámenes (${currentAvg}%) está ${cushion} puntos por debajo de la nota de corte media (${avgPassMark}%).`;

    return cushionText + trendText;
  })();

  return (
    <>
      <div className={`mb-3 rounded-2xl border p-3 text-[13px] leading-relaxed ${
        Math.round(movingAvg[movingAvg.length - 1]) >= avgPassMark
          ? 'border-success/50 bg-success/10 text-success'
          : 'border-warning/60 bg-warning/10 text-[#8a5a00]'
      }`}>
        <span className="text-foreground">{insight}</span>
      </div>
      <p className="mb-1.5 text-[13.5px] text-muted-foreground"><strong>Evolución de resultados:</strong></p>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de resultados de los exámenes">
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line className="trend-grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="trend-axis" x={padL - 6} y={y(v) + 3} textAnchor="end">{v}</text>
          </g>
        ))}
        <line className="trend-pass-line" x1={padL} y1={y(avgPassMark)} x2={W - padR} y2={y(avgPassMark)} />
        <polyline className="trend-line" points={scoreLine} />
        <polyline className="trend-avg-line" points={avgLine} />
        {chrono.map((e, i) => (
          <circle key={e.id} className={`trend-dot ${e.score >= e.pass_mark ? 'ok' : 'ko'}`} cx={x(i)} cy={y(e.score)} r={4} />
        ))}
        <text className="trend-axis" x={padL} y={H - 8} textAnchor="start">{firstDate}</text>
        <text className="trend-axis" x={W - padR} y={H - 8} textAnchor="end">{lastDate}</text>
      </svg>
      <div className="trend-legend">
        <span><i className="trend-swatch line" />Nota por examen</span>
        <span><i className="trend-swatch avg" />Media móvil (últimos 5)</span>
        <span><i className="trend-swatch pass" />Nota de corte media ({avgPassMark}%)</span>
      </div>
    </>
  );
}

/**
 * Lógica compartida entre el motor de examen del servidor (src/app/dashboard/actions.ts)
 * y el motor offline (src/lib/offline/exam-engine.ts). No depende de Supabase ni de
 * 'use server', así que la puede importar tanto código de servidor como de cliente.
 * Mantener aquí evita que ambos motores diverjan silenciosamente (ya pasó una vez con
 * question_stats, ver CLAUDE.md).
 */

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Nota sobre 100. `penalty` es lo que resta cada fallo en aciertos (0 = sin penalización,
 * 0.25 = cada fallo resta un cuarto de acierto, 1/3 = tres fallos anulan un acierto...).
 * Las preguntas en blanco no penalizan. La nota nunca baja de 0.
 */
export function scoreAttempt(params: {
  questionIds: string[];
  answers: (string | null)[];
  correctByQuestion: boolean[];
  penalty?: number;
}) {
  const total = params.questionIds.length;
  const correct = params.correctByQuestion.filter(Boolean).length;
  const blank = params.answers.filter(a => a === null).length;
  const incorrect = total - correct - blank;
  const penalty = Math.max(0, params.penalty ?? 0);
  const net = Math.max(0, correct - incorrect * penalty);
  const score = total ? Math.round((net / total) * 100) : 0;
  return { total, correct, incorrect, blank, score };
}

/** Penalizaciones habituales en oposiciones tipo test (valor = acierto que resta cada fallo). */
export const PENALTY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sin penalización' },
  { value: 0.25, label: 'Cada fallo resta 1/4' },
  { value: 1 / 3, label: 'Cada fallo resta 1/3' },
  { value: 0.5, label: 'Cada fallo resta 1/2' },
  { value: 1, label: 'Cada fallo resta 1' },
];

/**
 * El contador de aciertos (seen/correct) se actualiza siempre. last_seen_at, que rige el
 * ciclo de no-repetición, SOLO se actualiza si affectsCycle es true (examen normal completo,
 * no un repaso/repetición ni un examen abandonado a medias).
 */
export function applyAttemptToStats(
  existing: { seen: number; correct: number; last_seen_at: string | null } | null | undefined,
  wasCorrect: boolean,
  affectsCycle: boolean
) {
  return {
    seen: (existing?.seen ?? 0) + 1,
    correct: (existing?.correct ?? 0) + (wasCorrect ? 1 : 0),
    last_seen_at: affectsCycle ? new Date().toISOString() : (existing?.last_seen_at ?? null),
  };
}

/**
 * Repetición espaciada (SM-2 simplificado). Tras un acierto el intervalo crece
 * (1 día, 3 días y luego intervalo × facilidad); tras un fallo vuelve a 1 día y baja la
 * facilidad (mínimo 1,3). Se aplica en cualquier examen: es independiente del ciclo de
 * no-repetición (last_seen_at) y de las estadísticas de acierto.
 */
export type SrsState = { interval_days: number; ease: number; due_at: string | null };

export function nextSrsState(
  existing: { interval_days?: number | null; ease?: number | null } | null | undefined,
  wasCorrect: boolean,
  now: Date = new Date()
): SrsState {
  const prevInterval = existing?.interval_days ?? 0;
  const prevEase = existing?.ease ?? 2.5;
  let interval: number;
  let ease = prevEase;
  if (wasCorrect) {
    interval = prevInterval <= 0 ? 1 : prevInterval === 1 ? 3 : Math.round(prevInterval * prevEase);
    ease = Math.min(3, prevEase + 0.05);
  } else {
    interval = 1;
    ease = Math.max(1.3, prevEase - 0.2);
  }
  const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  return { interval_days: interval, ease: Math.round(ease * 100) / 100, due_at: due.toISOString() };
}

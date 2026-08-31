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

export function scoreAttempt(params: {
  questionIds: string[];
  answers: (string | null)[];
  correctByQuestion: boolean[];
}) {
  const total = params.questionIds.length;
  const correct = params.correctByQuestion.filter(Boolean).length;
  const blank = params.answers.filter(a => a === null).length;
  const incorrect = total - correct - blank;
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, incorrect, blank, score };
}

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

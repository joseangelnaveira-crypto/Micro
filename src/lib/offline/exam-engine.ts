import type { Question } from '@/lib/exam-types';
import { shuffle } from '@/lib/exam-utils';
import { getAllQuestions, getAllQuestionStats } from './db';

function filterByPool(questions: Question[], source?: string | null, topic?: string | null) {
  return questions.filter(q => (!source || q.source === source) && (!topic || q.topic === topic));
}

/**
 * Mismo algoritmo que startExam en src/app/dashboard/actions.ts: aleatoriza y luego
 * ordena de forma estable por última vez vista (nulls primero), para que las nunca vistas
 * salgan en orden aleatorio y las vistas hace más tiempo aparezcan antes que las recientes.
 */
export async function offlineStartExam(params: {
  numQuestions: number;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  const pool = filterByPool(await getAllQuestions(), params.source, params.topic);
  if (pool.length === 0) return [];

  const stats = await getAllQuestionStats();
  const lastSeen = new Map(stats.map(s => [s.question_id, s.last_seen_at]));

  const ordered = shuffle(pool).sort((a, b) => {
    const ta = lastSeen.get(a.id) ? new Date(lastSeen.get(a.id)!).getTime() : -Infinity;
    const tb = lastSeen.get(b.id) ? new Date(lastSeen.get(b.id)!).getTime() : -Infinity;
    return ta - tb;
  });

  return ordered.slice(0, Math.min(params.numQuestions, ordered.length));
}

export async function offlineStartReviewExam(questionIds: string[]): Promise<Question[]> {
  const byId = new Map((await getAllQuestions()).map(q => [q.id, q]));
  return questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q);
}

export async function offlineStartSmartReview(params: {
  numQuestions: number;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  const stats = (await getAllQuestionStats()).filter(s => s.seen > 0);
  if (stats.length === 0) return [];

  const pool = filterByPool(await getAllQuestions(), params.source, params.topic);
  const poolIds = new Set(pool.map(q => q.id));
  const byId = new Map(pool.map(q => [q.id, q]));

  const weak = stats
    .filter(s => poolIds.has(s.question_id))
    .map(s => ({ id: s.question_id, weakness: 1 - s.correct / s.seen }))
    .sort((a, b) => b.weakness - a.weakness);
  if (weak.length === 0) return [];

  const poolSize = Math.min(weak.length, Math.max(params.numQuestions * 3, params.numQuestions));
  const chosen = shuffle(weak.slice(0, poolSize)).slice(0, Math.min(params.numQuestions, weak.length));

  return chosen.map(w => byId.get(w.id)).filter((q): q is Question => !!q);
}

/**
 * Coincidencia simple de subcadena, sin intentar replicar el ranking trigram de Postgres
 * (searchQuestions en actions.ts) — suficiente para uso offline.
 */
export async function offlineSearchQuestions(params: {
  query: string;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  const q = params.query.trim().toLowerCase();
  if (q.length < 2) return [];

  const pool = filterByPool(await getAllQuestions(), params.source, params.topic);
  return pool
    .filter(item =>
      item.question.toLowerCase().includes(q) ||
      item.option_a.toLowerCase().includes(q) ||
      item.option_b.toLowerCase().includes(q) ||
      item.option_c.toLowerCase().includes(q) ||
      item.option_d.toLowerCase().includes(q) ||
      item.explanation.toLowerCase().includes(q)
    )
    .slice(0, 30);
}

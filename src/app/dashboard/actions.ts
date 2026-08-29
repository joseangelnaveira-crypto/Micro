'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllIds } from '@/lib/fetch-all';
import type { Question, ExamAttempt, BankMeta } from '@/lib/exam-types';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getBankMeta(): Promise<BankMeta> {
  const supabase = await createClient();

  // Se usa una función de Postgres que agrupa dentro de la base de datos, así que
  // solo vuelven unas pocas filas de resumen (no las miles de preguntas una por
  // una) -- evita el límite de 1000 filas por consulta de Supabase.
  const { data: rows, error } = await supabase.rpc('question_bank_breakdown');
  if (error) throw new Error(error.message);

  const sourceCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  let total = 0;
  (rows ?? []).forEach((r: { source: string; topic: string; cnt: number }) => {
    sourceCounts.set(r.source, (sourceCounts.get(r.source) ?? 0) + Number(r.cnt));
    topicCounts.set(r.topic, (topicCounts.get(r.topic) ?? 0) + Number(r.cnt));
    total += Number(r.cnt);
  });

  return {
    total,
    sources: [...sourceCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    topics: [...topicCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

/**
 * Cuántas preguntas del banco (o de un filtro de fuente/tema concreto) ya se
 * han usado en algún examen normal (gastan ciclo) y cuántas quedan pendientes.
 */
export async function getCycleProgress(params?: {
  source?: string | null;
  topic?: string | null;
}): Promise<{ total: number; unseen: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const poolIds = await fetchAllIds(supabase, 'questions', {
    source: params?.source, topic: params?.topic,
  });
  if (poolIds.length === 0) return { total: 0, unseen: 0 };

  const seenIds = await fetchAllIds(supabase, 'question_stats', {
    userId: user.id, onlySeen: true,
  });
  const seenSet = new Set(seenIds);
  const seenCount = poolIds.filter(id => seenSet.has(id)).length;

  return { total: poolIds.length, unseen: Math.max(poolIds.length - seenCount, 0) };
}

/**
 * Genera un examen priorizando preguntas nunca vistas o vistas hace más tiempo
 * (equivalente al "ciclo de no repetición" de la versión offline, pero sin
 * necesidad de reiniciar nada a mano: al ordenar por última vez vista, las
 * preguntas ya usadas hace mucho vuelven a aparecer solas cuando se agotan
 * las nuevas).
 */
export async function startExam(params: {
  numQuestions: number;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const poolIds = await fetchAllIds(supabase, 'questions', {
    source: params.source, topic: params.topic,
  });
  if (poolIds.length === 0) return [];

  // Últimas veces vistas del usuario para TODO el pool (no solo 1000).
  const lastSeen = new Map<string, string | null>();
  const PAGE = 1000;
  for (let from = 0; from < poolIds.length; from += PAGE) {
    const chunk = poolIds.slice(from, from + PAGE);
    const { data: statsRows } = await supabase
      .from('question_stats')
      .select('question_id, last_seen_at')
      .eq('user_id', user.id)
      .in('question_id', chunk);
    (statsRows ?? []).forEach(r => lastSeen.set(r.question_id, r.last_seen_at));
  }

  // Aleatoriza primero, y luego ordena de forma estable por última vez vista:
  // así los empates (todas las nunca vistas) quedan en orden aleatorio,
  // y las ya vistas hace más tiempo van apareciendo antes que las recientes.
  const ordered = shuffle(poolIds).sort((a, b) => {
    const ta = lastSeen.get(a) ? new Date(lastSeen.get(a)!).getTime() : -Infinity;
    const tb = lastSeen.get(b) ? new Date(lastSeen.get(b)!).getTime() : -Infinity;
    return ta - tb;
  });

  const chosenIds = ordered.slice(0, Math.min(params.numQuestions, ordered.length));

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .in('id', chosenIds);

  // Reordena el resultado según el orden ya decidido (in() no garantiza orden).
  const byId = new Map((questions ?? []).map(q => [q.id, q as Question]));
  return chosenIds.map(id => byId.get(id)!).filter(Boolean);
}

export async function startReviewExam(questionIds: string[]): Promise<Question[]> {
  const supabase = await createClient();
  const { data: questions } = await supabase.from('questions').select('*').in('id', questionIds);
  const byId = new Map((questions ?? []).map(q => [q.id, q as Question]));
  return questionIds.map(id => byId.get(id)!).filter(Boolean);
}

export async function finishExam(payload: {
  clientUuid: string;
  questionIds: string[];
  answers: (string | null)[];
  correctByQuestion: boolean[];
  durationMs: number;
  passMark: number;
  flaggedIds: string[];
  source: string | null;
  topic: string | null;
  affectsCycle: boolean;
}): Promise<ExamAttempt> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const total = payload.questionIds.length;
  const correct = payload.correctByQuestion.filter(Boolean).length;
  const blank = payload.answers.filter(a => a === null).length;
  const incorrect = total - correct - blank;
  const score = total ? Math.round((correct / total) * 100) : 0;

  const { data: attempt, error } = await supabase
    .from('exam_attempts')
    .insert({
      user_id: user.id,
      question_ids: payload.questionIds,
      answers: payload.answers,
      total, correct, incorrect, blank, score,
      pass_mark: payload.passMark,
      duration_ms: payload.durationMs,
      flagged_ids: payload.flaggedIds,
      source_filter: payload.source,
      topic_filter: payload.topic,
      client_uuid: payload.clientUuid,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Actualiza estadísticas por pregunta. El contador de aciertos (para el repaso
  // inteligente y las estadísticas de acierto) se actualiza siempre, en cualquier
  // tipo de examen. La marca de "última vez vista" que rige el ciclo de
  // no-repetición SOLO se actualiza cuando el examen se termina de verdad
  // (aparece en el historial) y era un examen normal generado desde cero --
  // ni un examen abandonado a medias ni un repaso de falladas/marcadas/repaso
  // inteligente/repetición cuentan para el ciclo.
  for (let i = 0; i < payload.questionIds.length; i++) {
    const qId = payload.questionIds[i];
    const wasCorrect = payload.correctByQuestion[i];
    const { data: existing } = await supabase
      .from('question_stats')
      .select('seen, correct, last_seen_at')
      .eq('user_id', user.id)
      .eq('question_id', qId)
      .maybeSingle();

    await supabase.from('question_stats').upsert({
      user_id: user.id,
      question_id: qId,
      seen: (existing?.seen ?? 0) + 1,
      correct: (existing?.correct ?? 0) + (wasCorrect ? 1 : 0),
      last_seen_at: payload.affectsCycle ? new Date().toISOString() : (existing?.last_seen_at ?? null),
    }, { onConflict: 'user_id,question_id' });
  }

  return attempt as ExamAttempt;
}

export async function getHistory(limit = 50): Promise<ExamAttempt[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('exam_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ExamAttempt[];
}

export type StudyStats = {
  overallAccuracy: number | null;
  totalAnswered: number;
  topicRows: { topic: string; pct: number; seen: number }[];
};

export async function getStudyStats(): Promise<StudyStats> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const statRows: { question_id: string; seen: number; correct: number }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('question_stats')
      .select('question_id, seen, correct')
      .eq('user_id', user.id)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    statRows.push(...data);
    if (data.length < PAGE) break;
  }

  const totalAnswered = statRows.reduce((s, r) => s + r.seen, 0);
  const totalCorrect = statRows.reduce((s, r) => s + r.correct, 0);
  const overallAccuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : null;

  if (statRows.length === 0) return { overallAccuracy, totalAnswered, topicRows: [] };

  const qIds = statRows.map(r => r.question_id);
  const topicById = new Map<string, string>();
  for (let i = 0; i < qIds.length; i += PAGE) {
    const chunk = qIds.slice(i, i + PAGE);
    const { data: qRows } = await supabase.from('questions').select('id, topic').in('id', chunk);
    (qRows ?? []).forEach(q => topicById.set(q.id, q.topic));
  }

  const byTopic = new Map<string, { seen: number; correct: number }>();
  statRows.forEach(r => {
    const topic = topicById.get(r.question_id) ?? 'General / otros';
    const entry = byTopic.get(topic) ?? { seen: 0, correct: 0 };
    entry.seen += r.seen;
    entry.correct += r.correct;
    byTopic.set(topic, entry);
  });

  const topicRows = [...byTopic.entries()]
    .map(([topic, v]) => ({ topic, pct: v.seen ? Math.round((v.correct / v.seen) * 100) : 0, seen: v.seen }))
    .filter(r => r.seen >= 3)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  return { overallAccuracy, totalAnswered, topicRows };
}

/**
 * Repaso inteligente: prioriza las preguntas con peor ratio de aciertos
 * (de entre las que el usuario ya ha visto al menos una vez).
 */
export async function startSmartReview(params: {
  numQuestions: number;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const statRows: { question_id: string; seen: number; correct: number }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('question_stats')
      .select('question_id, seen, correct')
      .eq('user_id', user.id)
      .gt('seen', 0)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    statRows.push(...data);
    if (data.length < PAGE) break;
  }

  if (statRows.length === 0) return [];

  const candidateIds = new Set<string>();
  for (let i = 0; i < statRows.length; i += PAGE) {
    const chunk = statRows.slice(i, i + PAGE).map(r => r.question_id);
    let qQuery = supabase.from('questions').select('id').in('id', chunk);
    if (params.source) qQuery = qQuery.eq('source', params.source);
    if (params.topic) qQuery = qQuery.eq('topic', params.topic);
    const { data: candidateRows } = await qQuery;
    (candidateRows ?? []).forEach(r => candidateIds.add(r.id));
  }

  const weak = statRows
    .filter(r => candidateIds.has(r.question_id))
    .map(r => ({ id: r.question_id, weakness: 1 - r.correct / r.seen }))
    .sort((a, b) => b.weakness - a.weakness);

  if (weak.length === 0) return [];

  // Entre las peores, un poco de aleatoriedad para no repasar siempre en el mismo orden exacto.
  const poolSize = Math.min(weak.length, Math.max(params.numQuestions * 3, params.numQuestions));
  const pool = shuffle(weak.slice(0, poolSize));
  const chosenIds = pool.slice(0, Math.min(params.numQuestions, pool.length)).map(w => w.id);

  const { data: questions } = await supabase.from('questions').select('*').in('id', chosenIds);
  const byId = new Map((questions ?? []).map(q => [q.id, q as Question]));
  return chosenIds.map(id => byId.get(id)!).filter(Boolean);
}

export async function searchQuestions(params: {
  query: string;
  source?: string | null;
  topic?: string | null;
}): Promise<Question[]> {
  if (params.query.trim().length < 2) return [];
  const supabase = await createClient();
  const q = params.query.trim();
  let query = supabase
    .from('questions')
    .select('*')
    .or(`question.ilike.%${q}%,option_a.ilike.%${q}%,option_b.ilike.%${q}%,option_c.ilike.%${q}%,option_d.ilike.%${q}%,explanation.ilike.%${q}%`)
    .limit(30);
  if (params.source) query = query.eq('source', params.source);
  if (params.topic) query = query.eq('topic', params.topic);
  const { data } = await query;
  return (data ?? []) as Question[];
}

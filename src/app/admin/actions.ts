'use server';

import { createClient } from '@/lib/supabase/server';
import { parseQuestionsText } from '@/lib/parse-questions';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('No autorizado');
  return { supabase, userId: user.id };
}

export type UserProgressRow = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  totalExams: number;
  avgScore: number | null;
  bestScore: number | null;
  lastExamAt: string | null;
  questionsAnswered: number;
};

export async function getAllUsersProgress(): Promise<UserProgressRow[]> {
  const { supabase } = await requireAdmin();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (!profiles || profiles.length === 0) return [];

  const PAGE = 1000;
  const attempts: { user_id: string; score: number; created_at: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('exam_attempts').select('user_id, score, created_at').range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    attempts.push(...data);
    if (data.length < PAGE) break;
  }

  const statRows: { user_id: string; seen: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('question_stats').select('user_id, seen').range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    statRows.push(...data);
    if (data.length < PAGE) break;
  }

  const attemptsByUser = new Map<string, { score: number; created_at: string }[]>();
  attempts.forEach(a => {
    const list = attemptsByUser.get(a.user_id) ?? [];
    list.push({ score: a.score, created_at: a.created_at });
    attemptsByUser.set(a.user_id, list);
  });

  const answeredByUser = new Map<string, number>();
  statRows.forEach(s => {
    answeredByUser.set(s.user_id, (answeredByUser.get(s.user_id) ?? 0) + s.seen);
  });

  return profiles.map(p => {
    const list = attemptsByUser.get(p.id) ?? [];
    const totalExams = list.length;
    const avgScore = totalExams ? Math.round(list.reduce((s, a) => s + a.score, 0) / totalExams) : null;
    const bestScore = totalExams ? Math.max(...list.map(a => a.score)) : null;
    const lastExamAt = totalExams
      ? list.reduce((latest, a) => (a.created_at > latest ? a.created_at : latest), list[0].created_at)
      : null;
    return {
      id: p.id,
      email: p.email,
      display_name: p.display_name,
      created_at: p.created_at,
      totalExams,
      avgScore,
      bestScore,
      lastExamAt,
      questionsAnswered: answeredByUser.get(p.id) ?? 0,
    };
  });
}

export type SourceBreakdown = { source: string; count: number };

export async function getQuestionBankBreakdown(): Promise<{ total: number; sources: SourceBreakdown[] }> {
  const { supabase } = await requireAdmin();
  const { data: rows, error } = await supabase.rpc('question_bank_breakdown');
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  (rows ?? []).forEach((r: { source: string; cnt: number }) => {
    counts.set(r.source, (counts.get(r.source) ?? 0) + Number(r.cnt));
  });
  const sources = [...counts.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  const total = sources.reduce((s, r) => s + r.count, 0);
  return { total, sources };
}

export async function importQuestions(params: {
  text: string;
  defaultSource: string;
  mode: 'append' | 'replace_source';
}): Promise<{ inserted: number; skipped: number; total: number }> {
  const { supabase } = await requireAdmin();

  const questions = parseQuestionsText(params.text, params.defaultSource || undefined);
  const totalBlocks = params.text.split(/\n\s*={3,}\s*\n/).map(b => b.trim()).filter(Boolean).length;
  const skipped = totalBlocks - questions.length;

  if (questions.length === 0) return { inserted: 0, skipped, total: totalBlocks };

  if (params.mode === 'replace_source' && params.defaultSource) {
    const { error: delError } = await supabase.from('questions').delete().eq('source', params.defaultSource);
    if (delError) throw new Error(delError.message);
  }

  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const chunk = questions.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('questions').insert(chunk);
    if (error) throw new Error(error.message);
    inserted += chunk.length;
  }

  return { inserted, skipped, total: totalBlocks };
}

export type QuestionReport = {
  id: string;
  question_id: string;
  reason: string;
  created_at: string;
  reporter_email: string | null;
  question_text: string;
};

export async function getQuestionReports(): Promise<QuestionReport[]> {
  const { supabase } = await requireAdmin();

  const { data: reports, error } = await supabase
    .from('question_reports')
    .select('id, question_id, user_id, reason, created_at')
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!reports || reports.length === 0) return [];

  const questionIds = [...new Set(reports.map(r => r.question_id))];
  const userIds = [...new Set(reports.map(r => r.user_id))];

  const [{ data: questions }, { data: profiles }] = await Promise.all([
    supabase.from('questions').select('id, question').in('id', questionIds),
    supabase.from('profiles').select('id, email').in('id', userIds),
  ]);
  const questionById = new Map((questions ?? []).map(q => [q.id, q.question]));
  const emailById = new Map((profiles ?? []).map(p => [p.id, p.email]));

  return reports.map(r => ({
    id: r.id,
    question_id: r.question_id,
    reason: r.reason,
    created_at: r.created_at,
    reporter_email: emailById.get(r.user_id) ?? null,
    question_text: questionById.get(r.question_id) ?? '(pregunta eliminada)',
  }));
}

export async function resolveQuestionReport(id: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from('question_reports').update({ resolved: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSource(source: string): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from('questions').delete().eq('source', source);
  if (error) throw new Error(error.message);
}

export async function exportBankText(): Promise<string> {
  const { supabase } = await requireAdmin();

  const PAGE = 1000;
  const rows: { question: string; option_a: string; option_b: string; option_c: string; option_d: string; correct: string; explanation: string; source: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from('questions')
      .select('question, option_a, option_b, option_c, option_d, correct, explanation, source')
      .order('source')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const chunks = rows.map(q =>
    `PREGUNTA: ${q.question}\nA) ${q.option_a}\nB) ${q.option_b}\nC) ${q.option_c}\nD) ${q.option_d}\n` +
    `CORRECTA: ${q.correct}\nEXPLICACION: ${q.explanation}\nFUENTE: ${q.source}`
  );
  return chunks.join('\n====\n');
}

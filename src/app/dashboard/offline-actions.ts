'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/fetch-all';
import type { Question, QuestionStat } from '@/lib/exam-types';

export async function downloadQuestionBank(): Promise<Question[]> {
  const supabase = await createClient();
  return fetchAllRows<Question>(supabase, 'questions', '*');
}

export async function downloadUserStats(): Promise<QuestionStat[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return fetchAllRows<QuestionStat>(
    supabase,
    'question_stats',
    'question_id, seen, correct, last_seen_at',
    { userId: user.id }
  );
}

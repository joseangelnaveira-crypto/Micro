'use server';

import { createClient } from '@/lib/supabase/server';

// Notas personales por pregunta (tabla question_notes, migración 11). Si la migración no está
// aplicada todavía, las funciones devuelven vacío/false en vez de romper el examen.

export async function getQuestionNote(questionId: string): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '';
  const { data, error } = await supabase
    .from('question_notes')
    .select('note')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();
  if (error) return '';
  return data?.note ?? '';
}

export async function saveQuestionNote(questionId: string, note: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const text = note.trim();
  if (!text) {
    const { error } = await supabase.from('question_notes').delete().eq('user_id', user.id).eq('question_id', questionId);
    return !error;
  }
  const { error } = await supabase.from('question_notes').upsert(
    { user_id: user.id, question_id: questionId, note: text.slice(0, 2000), updated_at: new Date().toISOString() },
    { onConflict: 'user_id,question_id' }
  );
  return !error;
}

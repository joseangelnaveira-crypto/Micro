import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase/PostgREST solo devuelve 1000 filas por consulta por defecto.
 * Esta función pagina automáticamente hasta traer todo, para no truncar
 * silenciosamente listas grandes (por ejemplo, los IDs de las 4837
 * preguntas del banco).
 */
export async function fetchAllIds(
  supabase: SupabaseClient,
  table: string,
  filters?: { source?: string | null; topic?: string | null; userId?: string; onlySeen?: boolean }
): Promise<string[]> {
  const PAGE = 1000;
  const all: string[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(table === 'question_stats' ? 'question_id' : 'id').range(from, from + PAGE - 1);
    if (filters?.source) q = q.eq('source', filters.source);
    if (filters?.topic) q = q.eq('topic', filters.topic);
    if (filters?.userId) q = q.eq('user_id', filters.userId);
    if (filters?.onlySeen) q = q.not('last_seen_at', 'is', null);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...data.map((r: Record<string, string>) => r.id ?? r.question_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

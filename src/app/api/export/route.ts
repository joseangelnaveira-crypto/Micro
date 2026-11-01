import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Copias de seguridad en JSON.
//   /api/export?what=questions  -> banco de preguntas completo (solo administrador)
//   /api/export?what=results    -> tus exámenes y estadísticas por pregunta (cada usuario las suyas)
// /api/ no pasa por el guard de src/proxy.ts, así que la sesión se comprueba aquí.
export const dynamic = 'force-dynamic';

async function fetchAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filter?: { column: string; value: string },
  order = 'id'
) {
  const rows: unknown[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    if (filter) q = q.eq(filter.column, filter.value);
    const { data, error } = await q.order(order, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const what = new URL(request.url).searchParams.get('what');
  const stamp = new Date().toISOString().slice(0, 10);
  let body: unknown;
  let filename: string;

  try {
    if (what === 'questions') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      body = { exportedAt: new Date().toISOString(), questions: await fetchAll(supabase, 'questions') };
      filename = `banco-preguntas-${stamp}.json`;
    } else if (what === 'results') {
      body = {
        exportedAt: new Date().toISOString(),
        attempts: await fetchAll(supabase, 'exam_attempts', { column: 'user_id', value: user.id }, 'created_at'),
        questionStats: await fetchAll(supabase, 'question_stats', { column: 'user_id', value: user.id }, 'question_id'),
      };
      filename = `mis-resultados-${stamp}.json`;
    } else {
      return NextResponse.json({ error: 'Parámetro what inválido (questions | results)' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }

  return new NextResponse(JSON.stringify(body, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

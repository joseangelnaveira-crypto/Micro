// Lo llama el cron de Vercel (vercel.json) una vez al día. Hace una consulta mínima a
// Supabase para que el plan gratuito no pause el proyecto por inactividad (se pausa tras
// ~1 semana sin actividad). No devuelve datos: bajo RLS el conteo anónimo es 0, pero la
// petición al API cuenta como actividad.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, error: 'Faltan variables de Supabase' }, { status: 500 });
  }

  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

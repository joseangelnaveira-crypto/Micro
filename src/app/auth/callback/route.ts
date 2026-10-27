import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next'); // p. ej. /reset-password

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Si el enlace del email pedía redirigir a una ruta concreta (reset de contraseña,
  // sobre todo), respetamos eso. Si no, dejamos al proxy decidir /pending vs /dashboard.
  const target = next && next.startsWith('/') ? next : '/';
  return NextResponse.redirect(`${origin}${target}`);
}

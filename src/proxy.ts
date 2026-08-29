import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Rutas que cualquiera puede visitar sin haber iniciado sesión.
const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path.startsWith(p));

  // Sin sesión -> solo puede ver las páginas públicas (login/signup).
  if (!user) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Con sesión: comprobamos su perfil (estado de aprobación y rol).
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('id', user.id)
    .single();

  // Si por lo que sea el trigger de creación de perfil aún no ha corrido, no bloqueamos.
  const status = profile?.status ?? 'pending';
  const role = profile?.role ?? 'user';

  // Usuario ya logueado no debería ver login/signup otra vez.
  if (isPublic && path !== '/auth/callback') {
    const url = request.nextUrl.clone();
    url.pathname = status === 'approved' ? '/dashboard' : '/pending';
    return NextResponse.redirect(url);
  }

  // Pendiente de aprobación (o rechazado) -> solo puede ver /pending.
  if (status !== 'approved' && path !== '/pending') {
    const url = request.nextUrl.clone();
    url.pathname = '/pending';
    return NextResponse.redirect(url);
  }

  // Aprobado pero intenta entrar a /pending -> lo mandamos a su dashboard.
  if (status === 'approved' && path === '/pending') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Rutas de administrador: solo role === 'admin'.
  if (path.startsWith('/admin') && role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)',
  ],
};

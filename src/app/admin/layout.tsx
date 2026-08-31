import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';
import { Button } from '@/components/ui/button';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-[880px] px-3.5 pt-4 pb-10 md:px-5 md:pt-7 md:pb-12">
      <div className="sticky top-0 z-50 -mx-3.5 mb-5 flex items-center justify-between border-b border-border bg-background/90 px-3.5 py-3.5 backdrop-blur-md md:-mx-5 md:px-5">
        <h1 className="text-lg font-extrabold tracking-tight">Panel de administrador</h1>
        <SignOutButton />
      </div>
      <nav className="mb-5 flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="auto">
          <a href="/admin">Aprobaciones</a>
        </Button>
        <Button asChild variant="ghost" size="auto">
          <a href="/admin/users">Usuarios</a>
        </Button>
        <Button asChild variant="ghost" size="auto">
          <a href="/admin/questions">Banco de preguntas</a>
        </Button>
        <Button asChild variant="ghost" size="auto">
          <a href="/dashboard">Ir a mi cuenta</a>
        </Button>
      </nav>
      {children}
    </div>
  );
}

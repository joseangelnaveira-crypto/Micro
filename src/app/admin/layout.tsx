import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

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
    <div className="wrap wide">
      <div className="topbar">
        <div className="brand" style={{ marginBottom: 0 }}>
          <h1>Panel de administrador</h1>
        </div>
        <SignOutButton />
      </div>
      <nav style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <a href="/admin"><button type="button" className="ghost" style={{ width: 'auto' }}>Aprobaciones</button></a>
        <a href="/admin/users"><button type="button" className="ghost" style={{ width: 'auto' }}>Usuarios</button></a>
        <a href="/admin/questions"><button type="button" className="ghost" style={{ width: 'auto' }}>Banco de preguntas</button></a>
        <a href="/dashboard"><button type="button" className="ghost" style={{ width: 'auto' }}>Ir a mi cuenta</button></a>
      </nav>
      {children}
    </div>
  );
}

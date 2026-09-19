import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBankMeta } from './actions';
import DashboardApp from './DashboardApp';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // exam_date es opcional (nueva columna, ver migración 00000000000009). Si aún no
  // se ha aplicado la migración, Supabase devolverá error de columna desconocida;
  // en ese caso caemos silenciosamente sin fecha de examen.
  let profile: { display_name: string | null; email: string | null; role: string | null; exam_date?: string | null } | null = null;
  const withExamDate = await supabase
    .from('profiles')
    .select('display_name, email, role, exam_date')
    .eq('id', user.id)
    .single();
  if (withExamDate.error && withExamDate.error.message.includes('exam_date')) {
    const fallback = await supabase
      .from('profiles')
      .select('display_name, email, role')
      .eq('id', user.id)
      .single();
    profile = fallback.data;
  } else {
    profile = withExamDate.data;
  }

  const meta = await getBankMeta();

  return (
    <DashboardApp
      displayName={profile?.display_name || profile?.email || 'usuario'}
      isAdmin={profile?.role === 'admin'}
      initialMeta={meta}
      userId={user.id}
      initialExamDate={profile?.exam_date ?? null}
    />
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBankMeta } from './actions';
import DashboardApp from './DashboardApp';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email, role')
    .eq('id', user.id)
    .single();

  const meta = await getBankMeta();

  return (
    <DashboardApp
      displayName={profile?.display_name || profile?.email || 'usuario'}
      isAdmin={profile?.role === 'admin'}
      initialMeta={meta}
      userId={user.id}
    />
  );
}

import { createClient } from '@/lib/supabase/server';
import ApprovalList from './ApprovalList';

export default async function AdminApprovalsPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at, status')
    .order('created_at', { ascending: true });

  return (
    <div className="card">
      <h2>Solicitudes de acceso</h2>
      <p className="hint">Aprueba o rechaza cada cuenta nueva antes de que pueda entrar a la aplicación.</p>
      <ApprovalList profiles={pending ?? []} />
    </div>
  );
}

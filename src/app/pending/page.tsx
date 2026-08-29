import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, email')
    .eq('id', user.id)
    .single();

  const rejected = profile?.status === 'rejected';

  return (
    <div className="wrap">
      <div className="brand"><h1>Academia de Microbiología</h1></div>
      <div className="card">
        <h2>{rejected ? 'Solicitud no aprobada' : 'Cuenta pendiente de aprobación'}</h2>
        <p className="hint">
          {rejected
            ? 'El administrador no ha aprobado esta cuenta. Si crees que es un error, contacta con él directamente.'
            : `Tu cuenta (${profile?.email ?? user.email}) se ha registrado correctamente. Un administrador tiene que aprobarla antes de que puedas acceder al banco de preguntas. Vuelve a comprobarlo más tarde.`}
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}

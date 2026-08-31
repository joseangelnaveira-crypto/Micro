import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Beaker, Clock3, ShieldX } from 'lucide-react';

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
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight">Academia de Microbiología</h1>
      </div>

      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <div className={`mb-1 flex size-11 items-center justify-center rounded-full ${rejected ? 'bg-destructive/15 text-destructive' : 'bg-warning/20 text-[#8a5a00]'}`}>
            {rejected ? <ShieldX className="size-5" /> : <Clock3 className="size-5" />}
          </div>
          <CardTitle>{rejected ? 'Solicitud no aprobada' : 'Cuenta pendiente de aprobación'}</CardTitle>
          <CardDescription>
            {rejected
              ? 'El administrador no ha aprobado esta cuenta. Si crees que es un error, contacta con él directamente.'
              : `Tu cuenta (${profile?.email ?? user.email}) se ha registrado correctamente. Un administrador tiene que aprobarla antes de que puedas acceder al banco de preguntas. Vuelve a comprobarlo más tarde.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}

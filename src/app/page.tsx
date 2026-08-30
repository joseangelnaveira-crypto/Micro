'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Beaker, MailCheck } from 'lucide-react';

export default function SignupPage() {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(null); }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading('email');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(null);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  const brand = (
    <div className="mb-7 flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Beaker className="size-5" />
      </div>
      <h1 className="text-xl font-extrabold tracking-tight">Academia de Microbiología</h1>
    </div>
  );

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
        {brand}
        <Card className="w-full max-w-[420px]">
          <CardHeader>
            <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-success/15 text-success">
              <MailCheck className="size-5" />
            </div>
            <CardTitle>Revisa tu correo</CardTitle>
            <CardDescription>
              Te hemos enviado un enlace de confirmación a <strong className="text-foreground">{email}</strong>. Tras
              confirmarlo, tu cuenta quedará pendiente de aprobación por el administrador — te avisaremos en cuanto
              puedas empezar a usar la aplicación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/login"><Button type="button" variant="ghost" block>Volver a iniciar sesión</Button></a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      {brand}
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>El registro requiere aprobación manual del administrador antes de poder acceder.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-xl border border-destructive bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive">
              {error}
            </div>
          )}

          <Button type="button" variant="google" block onClick={handleGoogle} disabled={loading !== null}>
            {loading === 'google' ? 'Conectando…' : 'Registrarme con Google'}
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> o con tu email <Separator className="flex-1" />
          </div>

          <form onSubmit={handleEmailSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" type="text" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" block disabled={loading !== null}>
              {loading === 'email' ? 'Creando cuenta…' : 'Crear cuenta'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-[13.5px] text-muted-foreground">
          ¿Ya tienes cuenta?&nbsp;<a href="/login" className="font-bold text-secondary hover:underline">Inicia sesión</a>
        </CardFooter>
      </Card>
    </div>
  );
}

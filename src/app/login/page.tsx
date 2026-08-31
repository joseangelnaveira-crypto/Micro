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
import { Beaker } from 'lucide-react';

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setLoading('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(null); }
    // Si no hay error, el navegador se redirige solo a Google.
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading('email');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(null);
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : error.message
      );
      return;
    }
    window.location.href = '/';
  }

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
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Accede con tu cuenta para continuar con tu preparación.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-xl border border-destructive bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive">
              {error}
            </div>
          )}

          <Button type="button" variant="google" block onClick={handleGoogle} disabled={loading !== null}>
            {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
          </Button>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" /> o con tu email <Separator className="flex-1" />
          </div>

          <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <Button type="submit" block disabled={loading !== null}>
              {loading === 'email' ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-[13.5px] text-muted-foreground">
          ¿No tienes cuenta?&nbsp;<a href="/signup" className="font-bold text-secondary hover:underline">Regístrate</a>
        </CardFooter>
      </Card>
    </div>
  );
}

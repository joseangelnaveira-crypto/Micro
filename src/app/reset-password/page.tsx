'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Al llegar desde el enlace del email, Supabase ya ha intercambiado el código por
    // una sesión temporal en /auth/callback -- comprobamos que la hay. Si no, el enlace
    // caducó o se usó dos veces.
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    // Cerramos la sesión temporal del recovery y mandamos al login, para forzar un
    // login limpio con la contraseña nueva.
    await supabase.auth.signOut();
    setTimeout(() => { window.location.href = '/login'; }, 1800);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="mb-7 flex items-center gap-2.5">
        <h1 className="font-display text-xl italic tracking-normal">Academia de Microbiología</h1>
      </div>

      <Card className="w-full max-w-[420px]">
        {done ? (
          <>
            <CardHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-5" />
              </div>
              <CardTitle>Contraseña actualizada</CardTitle>
              <CardDescription>Te llevamos al login para que entres con la nueva.</CardDescription>
            </CardHeader>
          </>
        ) : hasSession === false ? (
          <>
            <CardHeader>
              <CardTitle>Enlace no válido</CardTitle>
              <CardDescription>
                El enlace ha caducado o ya se ha usado. Pide uno nuevo desde la pantalla de recuperar contraseña.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/forgot-password"><Button type="button" block>Pedir otro enlace</Button></a>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Elige una contraseña nueva</CardTitle>
              <CardDescription>Mínimo 8 caracteres.</CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 rounded-xl border border-destructive bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">Contraseña nueva</Label>
                  <Input id="password" type="password" autoFocus required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Repetir contraseña</Label>
                  <Input id="confirm" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" block disabled={loading || hasSession === null}>
                  {loading ? 'Guardando…' : 'Guardar contraseña'}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

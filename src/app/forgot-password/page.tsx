'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
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
                <MailCheck className="size-5" />
              </div>
              <CardTitle>Revisa tu correo</CardTitle>
              <CardDescription>
                Si hay una cuenta registrada con <strong className="text-foreground">{email}</strong>, te hemos enviado un enlace
                para poner una contraseña nueva. Puede tardar un par de minutos en llegar; revisa también la carpeta de spam.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/login"><Button type="button" variant="ghost" block>Volver a iniciar sesión</Button></a>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Recuperar contraseña</CardTitle>
              <CardDescription>
                Introduce el email de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 rounded-xl border border-destructive bg-destructive/10 px-3.5 py-2.5 text-[13.5px] text-destructive">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <Button type="submit" block disabled={loading}>
                  {loading ? 'Enviando…' : 'Enviar enlace'}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="justify-center text-[13.5px] text-muted-foreground">
              <a href="/login" className="font-bold text-secondary hover:underline">Volver</a>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}

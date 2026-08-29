'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

  if (done) {
    return (
      <div className="wrap">
        <div className="brand"><h1>Academia de Microbiología</h1></div>
        <div className="card">
          <h2>Revisa tu correo</h2>
          <p className="hint">
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>. Tras confirmarlo,
            tu cuenta quedará pendiente de aprobación por el administrador — te avisaremos en
            cuanto puedas empezar a usar la aplicación.
          </p>
          <a href="/login"><button type="button" className="ghost">Volver a iniciar sesión</button></a>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="brand"><h1>Academia de Microbiología</h1></div>
      <div className="card">
        <h2>Crear cuenta</h2>
        <p className="hint">
          El registro requiere aprobación manual del administrador antes de poder acceder.
        </p>

        {error && <div className="error">{error}</div>}

        <button type="button" className="google" onClick={handleGoogle} disabled={loading !== null}>
          {loading === 'google' ? 'Conectando…' : 'Registrarme con Google'}
        </button>

        <div className="divider">o con tu email</div>

        <form onSubmit={handleEmailSignup}>
          <label htmlFor="name">Nombre</label>
          <input id="name" type="text" required value={name} onChange={e => setName(e.target.value)} />

          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />

          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />

          <button type="submit" disabled={loading !== null}>
            {loading === 'email' ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="foot-link">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
    <div className="wrap">
      <div className="brand">
        <h1>Academia de Microbiología</h1>
      </div>
      <div className="card">
        <h2>Iniciar sesión</h2>
        <p className="hint">Accede con tu cuenta para continuar con tu preparación.</p>

        {error && <div className="error">{error}</div>}

        <button type="button" className="google" onClick={handleGoogle} disabled={loading !== null}>
          {loading === 'google' ? 'Conectando…' : 'Continuar con Google'}
        </button>

        <div className="divider">o con tu email</div>

        <form onSubmit={handleEmailLogin}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />

          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />

          <button type="submit" disabled={loading !== null}>
            {loading === 'email' ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="foot-link">¿No tienes cuenta? <a href="/signup">Regístrate</a></p>
      </div>
    </div>
  );
}

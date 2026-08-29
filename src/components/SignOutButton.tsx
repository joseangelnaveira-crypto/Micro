'use client';

import { createClient } from '@/lib/supabase/client';

export default function SignOutButton({ label = 'Cerrar sesión' }: { label?: string }) {
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <button type="button" className="ghost" onClick={handleSignOut}>
      {label}
    </button>
  );
}

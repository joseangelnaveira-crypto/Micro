'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function SignOutButton({ label = 'Cerrar sesión' }: { label?: string }) {
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <Button type="button" variant="ghost" size="auto" onClick={handleSignOut}>
      <LogOut className="size-4" />
      {label}
    </Button>
  );
}

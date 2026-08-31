'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
};

export default function ApprovalList({ profiles }: { profiles: Profile[] }) {
  const supabase = createClient();
  const [items, setItems] = useState(profiles);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('profiles')
      .update({
        status,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        approved_by: user?.id ?? null,
      })
      .eq('id', id);
    setBusyId(null);
    if (!error) {
      setItems(prev => prev.map(p => (p.id === id ? { ...p, status } : p)));
    }
  }

  const pending = items.filter(p => p.status === 'pending');
  const decided = items.filter(p => p.status !== 'pending');

  if (items.length === 0) {
    return <p className="text-[13.5px] text-muted-foreground">Todavía no se ha registrado nadie.</p>;
  }

  return (
    <div>
      {pending.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">No hay solicitudes pendientes ahora mismo.</p>
      ) : (
        pending.map(p => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
            <div>
              <strong className="font-bold">{p.display_name || p.email}</strong>
              <div className="text-[12.5px] text-muted-foreground">{p.email}</div>
              <div className="text-[11.5px] text-muted-foreground">
                Registrado el {new Date(p.created_at).toLocaleDateString('es-ES')}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="auto"
                className="border-success bg-success text-success-foreground hover:bg-success/90"
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, 'approved')}
              >
                Aprobar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="auto"
                className="border-destructive text-destructive hover:bg-destructive/10"
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, 'rejected')}
              >
                Rechazar
              </Button>
            </div>
          </div>
        ))
      )}

      {decided.length > 0 && (
        <>
          <p className="mb-1.5 mt-6 text-[13.5px] text-muted-foreground"><strong>Ya resueltas</strong></p>
          {decided.map(p => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
              <div>
                <strong className="font-bold">{p.display_name || p.email}</strong>
                <div className="text-[12.5px] text-muted-foreground">{p.email}</div>
              </div>
              <Badge variant={p.status === 'approved' ? 'success' : 'destructive'}>
                {p.status === 'approved' ? 'Aprobado' : 'Rechazado'}
              </Badge>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

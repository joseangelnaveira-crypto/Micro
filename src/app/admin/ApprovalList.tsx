'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
    return <p className="hint">Todavía no se ha registrado nadie.</p>;
  }

  return (
    <div>
      {pending.length === 0 ? (
        <p className="hint">No hay solicitudes pendientes ahora mismo.</p>
      ) : (
        pending.map(p => (
          <div key={p.id} style={rowStyle}>
            <div>
              <strong>{p.display_name || p.email}</strong>
              <div style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{p.email}</div>
              <div style={{ fontSize: 11.5, color: 'var(--graphite)' }}>
                Registrado el {new Date(p.created_at).toLocaleDateString('es-ES')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={{ width: 'auto', background: 'var(--colony)', borderColor: 'var(--colony)' }}
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, 'approved')}
              >
                Aprobar
              </button>
              <button
                type="button"
                className="ghost"
                style={{ width: 'auto', color: 'var(--contam)', borderColor: 'var(--contam)' }}
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, 'rejected')}
              >
                Rechazar
              </button>
            </div>
          </div>
        ))
      )}

      {decided.length > 0 && (
        <>
          <p className="hint" style={{ marginTop: 24, marginBottom: 6 }}><strong>Ya resueltas</strong></p>
          {decided.map(p => (
            <div key={p.id} style={rowStyle}>
              <div>
                <strong>{p.display_name || p.email}</strong>
                <div style={{ fontSize: 12.5, color: 'var(--graphite)' }}>{p.email}</div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: p.status === 'approved' ? 'var(--colony)' : 'var(--contam)'
              }}>
                {p.status === 'approved' ? 'Aprobado' : 'Rechazado'}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 0', borderBottom: '1px solid var(--dish-line)',
};

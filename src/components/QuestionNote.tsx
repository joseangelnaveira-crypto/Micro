'use client';

import { useEffect, useState } from 'react';
import { getQuestionNote, saveQuestionNote } from '@/app/dashboard/notes-actions';
import { Textarea } from '@/components/ui/textarea';

/** Nota personal de una pregunta (p. ej. «por qué fallé»). Se guarda al salir del campo. */
export default function QuestionNote({ questionId, disabled }: { questionId: string; disabled?: boolean }) {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setNote(''); setSaved(''); setStatus('idle');
    if (disabled) return;
    getQuestionNote(questionId).then(n => { if (!cancelled) { setNote(n); setSaved(n); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [questionId, disabled]);

  async function save() {
    if (note.trim() === saved.trim()) return;
    setStatus('saving');
    const ok = await saveQuestionNote(questionId, note).catch(() => false);
    if (ok) { setSaved(note); setStatus('ok'); } else setStatus('error');
  }

  if (disabled) return null;
  return (
    <div className="mt-3">
      <label htmlFor={`note-${questionId}`} className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        Mi nota {status === 'saving' && '· guardando…'}{status === 'ok' && '· guardada'}{status === 'error' && '· no se pudo guardar'}
      </label>
      <Textarea
        id={`note-${questionId}`}
        className="min-h-16 font-sans"
        placeholder="Apunta por qué fallaste o un truco para recordarlo…"
        value={note}
        maxLength={2000}
        onChange={e => setNote(e.target.value)}
        onBlur={save}
      />
    </div>
  );
}

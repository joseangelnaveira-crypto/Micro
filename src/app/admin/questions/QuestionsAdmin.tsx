'use client';

import { useState } from 'react';
import { importQuestions, deleteSource, exportBankText, type SourceBreakdown } from '../actions';

export default function QuestionsAdmin({
  initialBreakdown,
}: {
  initialBreakdown: { total: number; sources: SourceBreakdown[] };
}) {
  const [breakdown, setBreakdown] = useState(initialBreakdown);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<'append' | 'replace_source'>('append');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
  }

  async function handleImport() {
    if (!text.trim()) return;
    if (mode === 'replace_source' && !source.trim()) {
      setMessage('⚠️ Para reemplazar por fuente, indica primero el nombre de la fuente.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await importQuestions({ text, defaultSource: source.trim(), mode });
      setMessage(
        `Importadas ${result.inserted} preguntas` +
        (result.skipped > 0 ? ` · ${result.skipped} bloques descartados (revisa el formato)` : '') +
        `. Banco total ahora: ${breakdown.total + result.inserted - (mode === 'replace_source' ? (breakdown.sources.find(s => s.source === source.trim())?.count ?? 0) : 0)}.`
      );
      setText('');
      const counts = new Map(breakdown.sources.map(s => [s.source, s.count]));
      if (mode === 'replace_source') counts.set(source.trim(), result.inserted);
      else counts.set(source.trim() || 'Sin especificar', (counts.get(source.trim() || 'Sin especificar') ?? 0) + result.inserted);
      const newSources = [...counts.entries()].map(([s, c]) => ({ source: s, count: c })).sort((a, b) => b.count - a.count);
      setBreakdown({ total: newSources.reduce((s, r) => s + r.count, 0), sources: newSources });
    } catch (err) {
      setMessage(`❌ Error: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
    setBusy(false);
  }

  async function handleDelete(src: string) {
    setBusy(true);
    try {
      await deleteSource(src);
      const newSources = breakdown.sources.filter(s => s.source !== src);
      setBreakdown({ total: newSources.reduce((s, r) => s + r.count, 0), sources: newSources });
      setMessage(`Eliminadas todas las preguntas de "${src}".`);
    } catch (err) {
      setMessage(`❌ Error: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
    setConfirmDelete(null);
    setBusy(false);
  }

  async function handleExport() {
    setBusy(true);
    try {
      const text = await exportBankText();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `banco-preguntas-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(`❌ Error al exportar: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Banco de preguntas</h2>
        <div className="stats-row">
          <div className="stat"><b>{breakdown.total}</b><span>preguntas totales</span></div>
        </div>
        <button type="button" className="ghost" style={{ width: 'auto', marginTop: 10 }} disabled={busy || breakdown.total === 0} onClick={handleExport}>
          ⬇ Exportar copia de seguridad (.txt)
        </button>
        {breakdown.sources.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {breakdown.sources.map(s => (
              <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--dish-line)', fontSize: 13.5 }}>
                <span>{s.source}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <b style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{s.count}</b>
                  {confirmDelete === s.source ? (
                    <>
                      <button type="button" style={{ width: 'auto', fontSize: 12, padding: '6px 10px', color: 'var(--contam)', borderColor: 'var(--contam)', background: 'transparent' }} disabled={busy} onClick={() => handleDelete(s.source)}>
                        Confirmar
                      </button>
                      <button type="button" className="ghost" style={{ width: 'auto', fontSize: 12, padding: '6px 10px' }} onClick={() => setConfirmDelete(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ghost" style={{ width: 'auto', fontSize: 12, padding: '6px 10px' }} onClick={() => setConfirmDelete(s.source)}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Importar preguntas</h2>
        <p className="hint">
          Pega texto en el formato PREGUNTA/A)/B)/C)/D)/CORRECTA/EXPLICACION (el mismo que genera{' '}
          <code>convertir.py</code>), o carga directamente un archivo .txt ya convertido.
        </p>

        <label>Fuente / lote</label>
        <input
          type="text"
          placeholder="Ej: Murray 9ª Ed. — Lote 2"
          value={source}
          onChange={e => setSource(e.target.value)}
        />

        <label>Modo</label>
        <select value={mode} onChange={e => setMode(e.target.value as 'append' | 'replace_source')}>
          <option value="append">Añadir al banco</option>
          <option value="replace_source">Reemplazar todo lo que ya haya de esta fuente</option>
        </select>

        <label>Archivo (opcional)</label>
        <input type="file" accept=".txt,.md,text/plain" onChange={handleFile} style={{ marginBottom: 14 }} />

        <label>O pega el texto aquí</label>
        <textarea
          rows={10}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="PREGUNTA: ...&#10;A) ...&#10;B) ...&#10;C) ...&#10;D) ...&#10;CORRECTA: B&#10;EXPLICACION: ...&#10;===="
          style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, padding: 12, borderRadius: 12, border: '2px solid var(--dish-line)', background: 'var(--agar)', color: 'var(--ink)', marginBottom: 14 }}
        />

        <button type="button" disabled={busy || !text.trim()} onClick={handleImport}>
          {busy ? 'Importando…' : 'Importar'}
        </button>

        {message && <p className="hint" style={{ marginTop: 12 }}><strong>{message}</strong></p>}
      </div>
    </>
  );
}

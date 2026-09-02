'use client';

import { useState } from 'react';
import { importQuestions, deleteSource, exportBankText, resolveQuestionReport, type SourceBreakdown, type QuestionReport } from '../actions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { IconUpload } from '@/components/Icons';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function QuestionsAdmin({
  initialBreakdown, initialReports,
}: {
  initialBreakdown: { total: number; sources: SourceBreakdown[] };
  initialReports: QuestionReport[];
}) {
  const [breakdown, setBreakdown] = useState(initialBreakdown);
  const [reports, setReports] = useState(initialReports);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
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

  async function handleResolveReport(id: string) {
    setResolvingId(id);
    try {
      await resolveQuestionReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setMessage(`❌ Error: ${err instanceof Error ? err.message : 'desconocido'}`);
    }
    setResolvingId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Badge variant="destructive">{reports.length}</Badge>
              <CardTitle>Errores reportados</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {reports.map(r => (
              <div key={r.id} className="rounded-2xl border border-border p-3.5">
                <p className="mb-1.5 text-[13.5px] font-semibold leading-snug">{r.question_text}</p>
                <p className="mb-2 text-[13px] leading-relaxed text-destructive">{r.reason}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-muted-foreground">
                    {r.reporter_email ?? 'usuario desconocido'} · {formatDate(r.created_at)}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={resolvingId === r.id}
                    onClick={() => handleResolveReport(r.id)}
                  >
                    {resolvingId === r.id ? 'Marcando…' : 'Marcar resuelto'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-secondary/10 text-secondary">
              <IconUpload />
            </span>
            <CardTitle>Banco de preguntas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-mono">
            <b className="block text-[23px] font-bold leading-none tracking-tight">{breakdown.total}</b>
            <span className="text-[10.5px] uppercase tracking-[1px] text-muted-foreground">preguntas totales</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="auto"
            className="mt-3"
            disabled={busy || breakdown.total === 0}
            onClick={handleExport}
          >
            ⬇ Exportar copia de seguridad (.txt)
          </Button>
          {breakdown.sources.length > 0 && (
            <div className="mt-3.5">
              {breakdown.sources.map(s => (
                <div key={s.source} className="flex items-center justify-between border-b border-border py-2 text-[13.5px] last:border-b-0">
                  <span>{s.source}</span>
                  <div className="flex items-center gap-2.5">
                    <b className="font-mono text-foreground">{s.count}</b>
                    {confirmDelete === s.source ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive/10"
                          disabled={busy}
                          onClick={() => handleDelete(s.source)}
                        >
                          Confirmar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(s.source)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importar preguntas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="mb-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Pega texto en el formato PREGUNTA/A)/B)/C)/D)/CORRECTA/EXPLICACION (el mismo que genera{' '}
            <code className="font-mono">convertir.py</code>), o carga directamente un archivo .txt ya convertido.
          </p>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <Label>Fuente / lote</Label>
            <Input
              type="text"
              placeholder="Ej: Murray 9ª Ed. — Lote 2"
              value={source}
              onChange={e => setSource(e.target.value)}
            />
          </div>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <Label>Modo</Label>
            <Select value={mode} onValueChange={v => setMode(v as 'append' | 'replace_source')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="append">Añadir al banco</SelectItem>
                <SelectItem value="replace_source">Reemplazar todo lo que ya haya de esta fuente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <Label>Archivo (opcional)</Label>
            <Input type="file" accept=".txt,.md,text/plain" onChange={handleFile} />
          </div>

          <div className="mb-3.5 flex flex-col gap-1.5">
            <Label>O pega el texto aquí</Label>
            <Textarea
              rows={10}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'PREGUNTA: ...\nA) ...\nB) ...\nC) ...\nD) ...\nCORRECTA: B\nEXPLICACION: ...\n===='}
            />
          </div>

          <Button type="button" size="auto" disabled={busy || !text.trim()} onClick={handleImport}>
            {busy ? 'Importando…' : 'Importar'}
          </Button>

          {message && <p className="mt-3 text-[13.5px] text-muted-foreground"><strong>{message}</strong></p>}
        </CardContent>
      </Card>
    </div>
  );
}

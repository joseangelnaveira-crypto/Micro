'use client';

import { useEffect, useRef, useState } from 'react';
import type { Question, ExamAttempt, BankMeta, FinishExamPayload } from '@/lib/exam-types';
import { startExam, startReviewExam, startSmartReview, finishExam, getHistory, getStudyStats, searchQuestions, getCycleProgress, deleteExamAttempt, reportQuestionError, type StudyStats } from './actions';
import {
  offlineStartExam, offlineStartReviewExam, offlineStartSmartReview, offlineSearchQuestions,
} from '@/lib/offline/exam-engine';
import { isBankReady, downloadBank, queueAttempt, hasPendingSync, drainQueue } from '@/lib/offline/sync';
import { scoreAttempt } from '@/lib/exam-utils';
import { IconBook, IconFlask, IconChart, IconSearch, IconHistory, IconPetri } from '@/components/Icons';
import SignOutButton from '@/components/SignOutButton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, WifiOff, Trash2, Bell, BellOff } from 'lucide-react';
import { hasPushSubscription } from './push-actions';
import { enableReminders, disableReminders } from '@/lib/push-client';

type Screen = 'home' | 'exam' | 'results';

type Result = {
  question: Question;
  selected: string | null;
  isCorrect: boolean;
};

type SavedProgress = {
  examQuestions: Question[];
  currentIndex: number;
  selected: string | null;
  checked: boolean;
  results: Result[];
  flaggedIds: string[];
  elapsedMs: number;
  passMark: number;
  numQuestions: number;
  sourceFilter: string;
  topicFilter: string;
  clientUuid: string;
  affectsCycle: boolean;
  savedAt: string;
};

type Modal = {
  message: string;
  type: 'confirm' | 'alert';
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
};

const PROGRESS_KEY = 'academia_exam_progress_v1';
const DARK_MODE_KEY = 'academia_dark_mode';

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function examComposition(questions: Question[]) {
  const counts = new Map<string, number>();
  questions.forEach(q => counts.set(q.source, (counts.get(q.source) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function StatBlock({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="font-mono">
      <b className="block text-[23px] font-bold leading-none tracking-tight">{value}</b>
      <span className="text-[10.5px] uppercase tracking-[1px] text-muted-foreground">{label}</span>
    </div>
  );
}

function CompositionTags({ composition, className }: { composition: [string, number][]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {composition.map(([s, cnt]) => (
        <span key={s} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {s} <b className="font-mono text-foreground">{cnt}</b>
        </span>
      ))}
    </div>
  );
}

export default function DashboardApp({
  displayName, isAdmin, initialMeta, userId,
}: {
  displayName: string;
  isAdmin: boolean;
  initialMeta: BankMeta;
  userId: string;
}) {
  const [screen, setScreen] = useState<Screen>('home');
  const [meta] = useState<BankMeta>(initialMeta);
  const [history, setHistory] = useState<ExamAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [globalCycle, setGlobalCycle] = useState<{ total: number; unseen: number } | null>(null);
  const [filterCycle, setFilterCycle] = useState<{ total: number; unseen: number } | null>(null);

  const [numQuestions, setNumQuestions] = useState(110);
  const [sourceFilter, setSourceFilter] = useState<string>('Todas');
  const [topicFilter, setTopicFilter] = useState<string>('Todos');
  const [passMark, setPassMark] = useState(50);
  const [starting, setStarting] = useState(false);

  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const clientUuidRef = useRef<string>('');
  const affectsCycleRef = useRef<boolean>(true);
  const segmentStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [lastAttempt, setLastAttempt] = useState<ExamAttempt | null>(null);

  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Question[]>([]);
  const [searching, setSearching] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const [modal, setModal] = useState<Modal | null>(null);
  function showConfirm(message: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }) {
    setModal({ message, type: 'confirm', onConfirm, confirmLabel: opts?.confirmLabel ?? 'Confirmar', danger: opts?.danger });
  }
  function showAlert(message: string) {
    setModal({ message, type: 'alert' });
  }

  const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  async function submitReport() {
    if (!reportingQuestionId || !reportReason.trim()) return;
    setReportSubmitting(true);
    try {
      await reportQuestionError(reportingQuestionId, reportReason);
      setReportingQuestionId(null);
      setReportReason('');
      showAlert('Gracias, el administrador revisará esta pregunta.');
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'No se ha podido enviar el reporte.');
    }
    setReportSubmitting(false);
  }

  async function syncBankIfNeeded() {
    const ready = await isBankReady(meta.total, userId);
    if (!ready) await downloadBank(userId, meta.total);
  }

  async function syncNow() {
    setSyncing(true);
    await drainQueue();
    setPendingSyncCount(await hasPendingSync());
    setSyncing(false);
    refreshHistory();
    refreshStats();
    getCycleProgress().then(setGlobalCycle);
    getCycleProgress({
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    }).then(setFilterCycle);
  }

  useEffect(() => {
    const online = navigator.onLine;
    setIsOnline(online);
    if (online) {
      refreshHistory();
      refreshStats();
      getCycleProgress().then(setGlobalCycle);
      syncBankIfNeeded();
    } else {
      setLoadingHistory(false);
    }
    hasPendingSync().then(setPendingSyncCount);
    hasPushSubscription().then(setRemindersEnabled);

    function handleOnline() {
      setIsOnline(true);
      syncBankIfNeeded();
      syncNow();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) setSavedProgress(JSON.parse(raw));
    } catch { /* noop */ }

    try {
      const dm = localStorage.getItem(DARK_MODE_KEY) === '1';
      setDarkMode(dm);
      document.body.classList.toggle('dark-mode', dm);
    } catch { /* noop */ }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getCycleProgress({
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    }).then(setFilterCycle);
  }, [sourceFilter, topicFilter]);

  function toggleDarkMode() {
    setDarkMode(prev => {
      const next = !prev;
      document.body.classList.toggle('dark-mode', next);
      try { localStorage.setItem(DARK_MODE_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }

  async function toggleReminders() {
    setRemindersBusy(true);
    try {
      if (remindersEnabled) {
        await disableReminders();
        setRemindersEnabled(false);
      } else {
        const result = await enableReminders();
        if (result.ok) setRemindersEnabled(true);
        else showAlert(result.reason ?? 'No se han podido activar los recordatorios.');
      }
    } catch {
      showAlert('No se han podido cambiar los recordatorios. Inténtalo de nuevo.');
    }
    setRemindersBusy(false);
  }

  async function refreshHistory() {
    setLoadingHistory(true);
    const h = await getHistory();
    setHistory(h);
    setLoadingHistory(false);
  }

  async function refreshStats() {
    const s = await getStudyStats();
    setStudyStats(s);
  }

  const [, setTick] = useState(0);
  function forceTick() { setTick(t => t + 1); }

  function startTimer() {
    segmentStartRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(forceTick, 1000);
  }
  function currentElapsed() {
    const running = segmentStartRef.current ? Date.now() - segmentStartRef.current : 0;
    return elapsedMs + running;
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (segmentStartRef.current) {
      setElapsedMs(prev => prev + (Date.now() - segmentStartRef.current!));
      segmentStartRef.current = null;
    }
  }

  function persistProgress(overrides?: Partial<SavedProgress>) {
    const payload: SavedProgress = {
      examQuestions, currentIndex, selected, checked, results,
      flaggedIds: [...flagged], elapsedMs: currentElapsed(), passMark, numQuestions,
      sourceFilter, topicFilter, clientUuid: clientUuidRef.current,
      affectsCycle: affectsCycleRef.current,
      savedAt: new Date().toISOString(),
      ...overrides,
    };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload)); } catch { /* noop */ }
  }
  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch { /* noop */ }
    setSavedProgress(null);
  }

  function handleStart(questions: Question[], affectsCycle = true) {
    if (questions.length === 0) return;
    clientUuidRef.current = crypto.randomUUID();
    affectsCycleRef.current = affectsCycle;
    setExamQuestions(questions);
    setCurrentIndex(0);
    setSelected(null);
    setChecked(false);
    setResults([]);
    setFlagged(new Set());
    setElapsedMs(0);
    setLastAttempt(null);
    setScreen('exam');
    startTimer();
  }

  function offlineBankBlocked() {
    showAlert('Sin conexión y todavía no hay banco de preguntas descargado. Conéctate una vez para prepararlo y poder usarlo offline.');
  }

  async function handleStartExam() {
    setStarting(true);
    const params = {
      numQuestions,
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    };
    const questions = isOnline ? await startExam(params) : await offlineStartExam(params);
    setStarting(false);
    if (questions.length === 0) {
      if (!isOnline) { offlineBankBlocked(); return; }
      showAlert('No hay preguntas que coincidan con ese filtro de fuente y tema. Prueba a ampliarlo.');
      return;
    }
    handleStart(questions, true);
  }

  async function handleSmartReview() {
    setStarting(true);
    const params = {
      numQuestions,
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    };
    const questions = isOnline ? await startSmartReview(params) : await offlineStartSmartReview(params);
    setStarting(false);
    if (questions.length === 0) {
      if (!isOnline) { offlineBankBlocked(); return; }
      showAlert('Todavía no hay suficiente historial de respuestas (con este filtro) para generar un repaso inteligente. Realiza al menos un examen primero.');
      return;
    }
    handleStart(questions, false);
  }

  async function handleRepeat(attempt: ExamAttempt) {
    const questions = isOnline
      ? await startReviewExam(attempt.question_ids)
      : await offlineStartReviewExam(attempt.question_ids);
    setPassMark(attempt.pass_mark);
    handleStart(questions, false);
  }

  function handleDeleteAttempt(attempt: ExamAttempt) {
    showConfirm(
      '¿Eliminar este examen del historial? Esta acción no se puede deshacer.',
      async () => {
        await deleteExamAttempt(attempt.id);
        refreshHistory();
      },
      { confirmLabel: 'Eliminar', danger: true }
    );
  }

  function resumeProgress() {
    if (!savedProgress) return;
    clientUuidRef.current = savedProgress.clientUuid;
    affectsCycleRef.current = savedProgress.affectsCycle ?? true;
    setExamQuestions(savedProgress.examQuestions);
    setCurrentIndex(savedProgress.currentIndex);
    setSelected(savedProgress.selected);
    setChecked(savedProgress.checked);
    setResults(savedProgress.results);
    setFlagged(new Set(savedProgress.flaggedIds));
    setElapsedMs(savedProgress.elapsedMs);
    setPassMark(savedProgress.passMark);
    setScreen('exam');
    startTimer();
  }

  function discardProgress() {
    showConfirm('¿Descartar el examen en curso? Perderás lo que llevas contestado.', () => {
      clearProgress();
    }, { confirmLabel: 'Descartar', danger: true });
  }

  function selectOption(letter: string) {
    if (checked) return;
    setSelected(letter);
    setChecked(true);
    const q = examQuestions[currentIndex];
    const newResults = [...results, { question: q, selected: letter, isCorrect: letter === q.correct }];
    setResults(newResults);
    persistProgress({ selected: letter, checked: true, results: newResults });
  }

  function toggleFlag(id: string) {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persistProgress({ flaggedIds: [...next] });
      return next;
    });
  }

  async function nextQuestion() {
    if (currentIndex + 1 >= examQuestions.length) {
      await finish();
    } else {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSelected(null);
      setChecked(false);
      persistProgress({ currentIndex: nextIdx, selected: null, checked: false });
    }
  }

  async function finish() {
    stopTimer();
    setFinishing(true);
    const questionIds = examQuestions.map(q => q.id);
    const sortedResults = results
      .slice()
      .sort((a, b) => questionIds.indexOf(a.question.id) - questionIds.indexOf(b.question.id));
    const answers = sortedResults.map(r => r.selected);
    const correctByQuestion = examQuestions.map(q => {
      const r = results.find(res => res.question.id === q.id);
      return !!r?.isCorrect;
    });

    const payload: FinishExamPayload = {
      clientUuid: clientUuidRef.current,
      questionIds,
      answers,
      correctByQuestion,
      durationMs: currentElapsed(),
      passMark,
      flaggedIds: [...flagged],
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
      affectsCycle: affectsCycleRef.current,
    };

    let attempt: ExamAttempt;
    if (isOnline) {
      attempt = await finishExam(payload);
    } else {
      await queueAttempt(payload);
      setPendingSyncCount(await hasPendingSync());
      attempt = {
        id: payload.clientUuid,
        question_ids: payload.questionIds,
        answers: payload.answers,
        ...scoreAttempt(payload),
        pass_mark: payload.passMark,
        duration_ms: payload.durationMs,
        flagged_ids: payload.flaggedIds,
        source_filter: payload.source,
        topic_filter: payload.topic,
        client_uuid: payload.clientUuid,
        created_at: new Date().toISOString(),
        affects_cycle: payload.affectsCycle,
      };
    }

    clearProgress();
    setLastAttempt(attempt);
    setFinishing(false);
    setScreen('results');
    if (isOnline) {
      refreshHistory();
      refreshStats();
      getCycleProgress().then(setGlobalCycle);
      getCycleProgress({
        source: sourceFilter === 'Todas' ? null : sourceFilter,
        topic: topicFilter === 'Todos' ? null : topicFilter,
      }).then(setFilterCycle);
    }
  }

  function requestExit() {
    showConfirm(
      '¿Salir del examen? Lo que llevas contestado queda guardado y podrás continuar más tarde desde el inicio.',
      () => {
        stopTimer();
        persistProgress();
        try {
          const raw = localStorage.getItem(PROGRESS_KEY);
          if (raw) setSavedProgress(JSON.parse(raw));
        } catch { /* noop */ }
        setScreen('home');
      },
      { confirmLabel: 'Salir' }
    );
  }

  function backHome() {
    stopTimer();
    setScreen('home');
  }

  async function reviewFailed() {
    const failedIds = results.filter(r => !r.isCorrect).map(r => r.question.id);
    if (failedIds.length === 0) return;
    const questions = isOnline ? await startReviewExam(failedIds) : await offlineStartReviewExam(failedIds);
    handleStart(questions, false);
  }

  async function reviewFlagged() {
    const ids = [...flagged];
    if (ids.length === 0) return;
    const questions = isOnline ? await startReviewExam(ids) : await offlineStartReviewExam(ids);
    handleStart(questions, false);
  }

  const [searchSource, setSearchSource] = useState<string>('Todas');
  const [searchTopic, setSearchTopic] = useState<string>('Todos');

  async function runSearch(q: string, source = searchSource, topic = searchTopic) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const params = {
      query: q,
      source: source === 'Todas' ? null : source,
      topic: topic === 'Todos' ? null : topic,
    };
    const res = isOnline ? await searchQuestions(params) : await offlineSearchQuestions(params);
    setSearching(false);
    setSearchResults(res);
  }

  const modalNode = (
    <Dialog open={!!modal} onOpenChange={(open) => { if (!open) setModal(null); }}>
      <DialogContent showCloseButton={false} className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-normal leading-relaxed tracking-normal text-foreground">
            {modal?.message}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          {modal?.type === 'confirm' && (
            <Button type="button" variant="ghost" size="auto" onClick={() => setModal(null)}>Cancelar</Button>
          )}
          <Button
            type="button"
            size="auto"
            variant={modal?.type === 'confirm' && modal.danger ? 'destructive' : 'default'}
            onClick={() => { const cb = modal?.onConfirm; setModal(null); cb?.(); }}
          >
            {modal?.type === 'confirm' ? modal.confirmLabel : 'Aceptar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const container = 'mx-auto max-w-[880px] px-3.5 pt-4 pb-10 md:px-5 md:pt-7 md:pb-12';

  if (screen === 'exam') {
    const q = examQuestions[currentIndex];
    const total = examQuestions.length;
    const scoreSoFar = results.filter(r => r.isCorrect).length;
    const pct = Math.round((currentIndex / total) * 100);
    const isFlagged = flagged.has(q.id);
    const options: [string, string][] = [
      ['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d],
    ];
    const composition = examComposition(examQuestions);

    return (
      <div className={container}>
        {modalNode}
        <Dialog open={!!reportingQuestionId} onOpenChange={(open) => { if (!open) setReportingQuestionId(null); }}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Reportar error en esta pregunta</DialogTitle>
            </DialogHeader>
            <Textarea
              rows={4}
              autoFocus
              placeholder="¿Qué está mal? (respuesta incorrecta, errata, explicación confusa...)"
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" size="auto" onClick={() => setReportingQuestionId(null)}>Cancelar</Button>
              <Button type="button" size="auto" disabled={reportSubmitting || !reportReason.trim()} onClick={submitReport}>
                {reportSubmitting ? 'Enviando…' : 'Enviar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Card>
          <CardContent className="pt-6">
            <div className="mb-1.5 flex justify-between font-mono text-xs font-semibold text-muted-foreground">
              <span>PREGUNTA {currentIndex + 1} / {total}</span>
              <span>{formatDuration(currentElapsed())}</span>
              <span>ACIERTOS {scoreSoFar}</span>
            </div>
            <div className="mb-4 h-[7px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-success to-warning transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {examQuestions.map((qq, i) => {
                const r = results.find(res => res.question.id === qq.id);
                const qFlagged = flagged.has(qq.id);
                return (
                  <span
                    key={qq.id + i}
                    className={cn(
                      'size-2 rounded-full bg-muted transition-colors',
                      r && (r.isCorrect ? 'bg-success' : 'bg-destructive'),
                      qFlagged && 'ring-2 ring-warning'
                    )}
                  />
                );
              })}
            </div>
            {composition.length > 1 && <CompositionTags composition={composition} className="mb-3.5" />}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <Badge variant="secondary">{q.source} · {q.topic}</Badge>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => { setReportingQuestionId(q.id); setReportReason(''); }}
                >
                  Reportar error
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleFlag(q.id)}
                  className={isFlagged ? 'border-warning bg-warning/15 text-[#8a5a00] hover:bg-warning/20' : undefined}
                >
                  {isFlagged ? '🚩 Marcada' : '🏳️ Marcar'}
                </Button>
              </div>
            </div>
            {q.image_url && (
              <img
                src={q.image_url}
                alt=""
                className="mb-4 max-h-[280px] w-full rounded-2xl border border-border object-contain bg-background"
              />
            )}
            <p className="mb-5 text-xl font-bold leading-relaxed tracking-tight">{q.question}</p>

            <div className="flex flex-col gap-2">
              {options.map(([letter, text]) => {
                let stateClass = '';
                if (checked) {
                  if (letter === q.correct) stateClass = 'border-success bg-success/10';
                  else if (letter === selected) stateClass = 'border-destructive bg-destructive/10';
                }
                return (
                  <button
                    key={letter}
                    type="button"
                    data-slot="option"
                    disabled={checked}
                    onClick={() => selectOption(letter)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border border-input bg-card px-4 py-3.5 text-left text-[15px] font-medium leading-snug text-foreground transition-all',
                      'hover:border-secondary hover:-translate-y-px hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none',
                      stateClass
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-7 flex-none items-center justify-center rounded-full bg-background font-mono text-xs font-extrabold text-muted-foreground transition-colors',
                        checked && letter === q.correct && 'bg-success text-success-foreground',
                        checked && letter === selected && letter !== q.correct && 'bg-destructive text-destructive-foreground'
                      )}
                    >
                      {letter}
                    </span>
                    <span>{text}</span>
                  </button>
                );
              })}
            </div>

            {checked && (
              <div
                className={cn(
                  'mt-3 rounded-2xl border p-4 text-[14.5px] leading-relaxed',
                  selected === q.correct ? 'border-success bg-success/10 text-success' : 'border-destructive bg-destructive/10 text-destructive'
                )}
              >
                <span className="mb-1.5 block text-[12.5px] font-extrabold uppercase tracking-wide">
                  {selected === q.correct ? 'Respuesta correcta' : `Respuesta incorrecta · la correcta es ${q.correct}`}
                </span>
                <span className="text-foreground">{q.explanation || 'Sin explicación disponible para esta pregunta.'}</span>
                {(q.source_page || q.source_url) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2.5 text-[12.5px] text-muted-foreground">
                    {q.source_page && <span>Página {q.source_page} · {q.source}</span>}
                    {q.source_url && (
                      <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-secondary hover:underline">
                        Leer más ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <Button type="button" variant="ghost" size="auto" onClick={requestExit}>Salir</Button>
              {checked && (
                <Button type="button" size="auto" disabled={finishing} onClick={nextQuestion}>
                  {finishing ? 'Guardando…' : currentIndex + 1 >= total ? 'Ver resultados' : 'Siguiente pregunta →'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === 'results' && lastAttempt) {
    const passed = lastAttempt.score >= lastAttempt.pass_mark;
    const failed = results.filter(r => !r.isCorrect);
    const composition = examComposition(examQuestions);

    return (
      <div className={container}>
        {modalNode}
        <Card className="mb-4 text-center">
          <CardContent className="pt-6">
            <h2 className="font-display mb-1.5 text-[19px] italic">Resultados del examen</h2>
            <div
              className="mx-auto my-2 flex size-[152px] items-center justify-center rounded-full shadow-lg"
              style={{ background: `conic-gradient(${passed ? 'var(--success)' : 'var(--destructive)'} calc(${lastAttempt.score} * 1%), var(--border) 0)` }}
            >
              <div className="flex size-[118px] flex-col items-center justify-center rounded-full bg-card font-mono shadow-inner">
                <b className="text-[30px] leading-none tracking-tight">{lastAttempt.score}%</b>
                <span className={cn('mt-[5px] text-[10.5px] font-extrabold uppercase tracking-[1.5px]', passed ? 'text-success' : 'text-destructive')}>
                  {passed ? 'Apto' : 'No apto'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <StatBlock value={lastAttempt.correct} label="correctas" />
              <StatBlock value={lastAttempt.incorrect} label="incorrectas" />
              <StatBlock value={lastAttempt.total} label="total" />
              <StatBlock value={formatDuration(lastAttempt.duration_ms)} label="tiempo" />
            </div>
            {composition.length > 1 && <CompositionTags composition={composition} className="mt-3.5 justify-center" />}
            <p className="mt-4 text-[13.5px] text-muted-foreground">Nota de corte: {lastAttempt.pass_mark}%</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Button type="button" variant="ghost" size="auto" onClick={backHome}>Volver al inicio</Button>
              {flagged.size > 0 && (
                <Button type="button" variant="secondary" size="auto" onClick={reviewFlagged}>
                  🚩 Repasar marcadas ({flagged.size})
                </Button>
              )}
              {failed.length > 0 && (
                <Button type="button" variant="secondary" size="auto" onClick={reviewFailed}>
                  Repasar falladas ({failed.length})
                </Button>
              )}
              <Button type="button" size="auto" onClick={handleStartExam}>Nuevo examen aleatorio</Button>
            </div>
          </CardContent>
        </Card>

        {failed.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-display mb-4 text-[19px] italic">Repaso de preguntas falladas</h2>
              {failed.map(r => {
                const opts: Record<string, string> = {
                  A: r.question.option_a, B: r.question.option_b, C: r.question.option_c, D: r.question.option_d,
                };
                return (
                  <div key={r.question.id} className="border-t border-border/60 py-[15px] first:border-t-0 first:pt-0">
                    <p className="mb-2 text-[15px]">{r.question.question}{flagged.has(r.question.id) ? ' 🚩' : ''}</p>
                    <div className="my-[3px] text-[13.5px] text-destructive">
                      Tu respuesta: {r.selected ? `${r.selected}) ${opts[r.selected]}` : '(en blanco)'}
                    </div>
                    <div className="my-[3px] text-[13.5px] text-success">Correcta: {r.question.correct}) {opts[r.question.correct]}</div>
                    <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{r.question.explanation || 'Sin explicación disponible.'}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-display mb-1.5 text-[19px] italic">Examen perfecto</h2>
              <p className="text-[13.5px] text-muted-foreground">Has acertado todas las preguntas de este examen.</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const smartAvailable = studyStats ? studyStats.totalAnswered > 0 : false;

  return (
    <div className={container}>
      {modalNode}
      <div className="sticky top-0 z-50 -mx-3.5 mb-5 flex items-center justify-between border-b border-border bg-background/90 px-3.5 py-3.5 backdrop-blur-md md:-mx-5 md:px-5">
        <div className="flex items-center gap-2">
          <span className="text-secondary"><IconPetri /></span>
          <h1 className="font-display text-xl italic tracking-normal">Academia de Microbiología</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={remindersBusy}
            onClick={toggleReminders}
            title={remindersEnabled ? 'Desactivar recordatorios' : 'Avisarme si dejo de estudiar'}
          >
            {remindersEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={toggleDarkMode} title="Modo oscuro">
            {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="auto">
              <a href="/admin">Panel de administrador</a>
            </Button>
          )}
          <SignOutButton />
        </div>
      </div>

      {!isOnline && (
        <Card className="mb-4 border-warning/60 bg-warning/5">
          <CardContent className="flex flex-wrap items-center gap-2.5 pt-6">
            <Badge variant="warning" className="gap-1.5"><WifiOff className="size-3.5" /> Sin conexión</Badge>
            <p className="text-[13.5px] text-muted-foreground">
              Puedes seguir haciendo exámenes con el banco descargado; los resultados se sincronizarán al recuperar la conexión.
            </p>
          </CardContent>
        </Card>
      )}

      {isOnline && pendingSyncCount > 0 && (
        <Card className="mb-4 border-secondary/60 bg-secondary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-2.5 pt-6">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="secondary">{pendingSyncCount} examen{pendingSyncCount === 1 ? '' : 'es'} sin sincronizar</Badge>
              <p className="text-[13.5px] text-muted-foreground">Se guardaron sin conexión.</p>
            </div>
            <Button type="button" variant="secondary" size="auto" disabled={syncing} onClick={syncNow}>
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </Button>
          </CardContent>
        </Card>
      )}

      {savedProgress && (
        <Card className="mb-4 border-warning/60 bg-warning/5">
          <CardHeader>
            <CardTitle>Examen en curso</CardTitle>
            <CardDescription>
              Te quedaste en la pregunta {savedProgress.currentIndex + 1} de {savedProgress.examQuestions.length}
              {' '}(guardado {formatDate(savedProgress.savedAt)}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2.5">
            <Button type="button" size="auto" onClick={resumeProgress}>Continuar examen</Button>
            <Button type="button" variant="ghost" size="auto" onClick={discardProgress}>Descartar</Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid items-start gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-secondary/10 text-secondary">
                <IconBook />
              </span>
              <CardTitle>Banco de preguntas</CardTitle>
            </div>
            <CardDescription>Bienvenido, {displayName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              <StatBlock value={meta.total} label="en el banco" />
              <StatBlock value={globalCycle ? globalCycle.unseen : '…'} label="pendientes ciclo" />
            </div>
            {meta.sources.length > 0 && (
              <div className="mt-3.5">
                <p className="mb-1 text-[13.5px] text-muted-foreground">Preguntas por libro/lote:</p>
                {meta.sources.map(s => (
                  <div key={s.name} className="flex justify-between py-[3px] text-[13px] text-muted-foreground">
                    <span>{s.name}</span><b className="text-foreground">{s.count}</b>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-[3px] border-t-secondary bg-gradient-to-br from-card via-card to-secondary/5">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground">
                <IconFlask />
              </span>
              <CardTitle>Generar examen</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {meta.sources.length > 1 && (
              <div className="mb-3.5 flex flex-col gap-1.5">
                <Label>Fuente</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todas">Todas las fuentes ({meta.total})</SelectItem>
                    {meta.sources.map(s => (
                      <SelectItem key={s.name} value={s.name}>{s.name} ({s.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {meta.topics.length > 1 && (
              <div className="mb-3.5 flex flex-col gap-1.5">
                <Label>Tema</Label>
                <Select value={topicFilter} onValueChange={setTopicFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Todos">Todos los temas</SelectItem>
                    {meta.topics.map(t => (
                      <SelectItem key={t.name} value={t.name}>{t.name} ({t.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="mb-1.5">
              <Label>Número de preguntas</Label>
            </div>
            <div className="mb-3.5 flex gap-2.5">
              <Input
                type="number"
                min={1}
                value={numQuestions}
                onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <Button type="button" size="auto" disabled={starting || meta.total === 0} onClick={handleStartExam}>
                {starting ? 'Generando…' : 'Empezar examen'}
              </Button>
            </div>
            {meta.total === 0 ? (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                Todavía no hay preguntas en el banco. {isAdmin ? (
                  <a href="/admin/questions" className="font-bold text-secondary hover:underline">Impórtalas desde el panel de administrador</a>
                ) : 'Pídele al administrador que las suba.'}
              </p>
            ) : filterCycle && (
              <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                Se generará un examen con {Math.min(numQuestions, filterCycle.total)} de las {filterCycle.total} preguntas disponibles
                {sourceFilter !== 'Todas' || topicFilter !== 'Todos' ? ' con este filtro' : ''} ({filterCycle.unseen} pendientes todavía en el ciclo).
              </p>
            )}
            <div className="mb-1.5 mt-3.5">
              <Label>Nota de corte (%)</Label>
            </div>
            <Input
              type="number"
              min={0}
              max={100}
              value={passMark}
              onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              className="mb-3.5"
            />
            <Button
              type="button"
              variant="secondary"
              block
              disabled={starting || !smartAvailable}
              onClick={handleSmartReview}
              className="h-auto whitespace-normal py-3 text-center leading-snug"
            >
              Repaso inteligente (prioriza las preguntas con más fallos)
            </Button>
            {!smartAvailable && <p className="mt-2 text-[13.5px] text-muted-foreground">Disponible en cuanto hayas respondido alguna pregunta.</p>}
          </CardContent>
        </Card>
      </div>

      {studyStats && studyStats.totalAnswered > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <details className="group">
              <summary className="font-display mb-0 flex cursor-pointer list-none items-center gap-2 text-[19px] italic marker:content-none group-open:mb-3.5">
                <IconChart /> Estadísticas de estudio
              </summary>
              {(() => {
                const totalExams = history.length;
                const avgScore = totalExams ? Math.round(history.reduce((s, h) => s + h.score, 0) / totalExams) : null;
                const bestScore = totalExams ? Math.max(...history.map(h => h.score)) : null;
                const passCount = history.filter(h => h.score >= h.pass_mark).length;
                return (
                  <>
                    <div className="mb-1 flex flex-wrap gap-6">
                      <StatBlock value={totalExams} label="exámenes realizados" />
                      <StatBlock value={`${avgScore ?? '–'}%`} label="nota media" />
                      <StatBlock value={`${bestScore ?? '–'}%`} label="mejor nota" />
                      <StatBlock value={`${studyStats.overallAccuracy ?? '–'}%`} label="acierto global" />
                    </div>
                    <p className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">
                      {passCount} de {totalExams} exámenes por encima de la nota de corte · {studyStats.totalAnswered} preguntas respondidas en total.
                    </p>
                  </>
                );
              })()}
              <TrendChart history={history} />
              {studyStats.topicRows.length > 0 && (
                <>
                  <p className="mb-1.5 text-[13.5px] text-muted-foreground"><strong>Temas con mayor tasa de error:</strong></p>
                  {studyStats.topicRows.map(r => (
                    <div key={r.topic} className="flex justify-between py-[3px] text-[13px] text-muted-foreground">
                      <span>{r.topic}</span><b className="text-foreground">{r.pct}%</b>
                    </div>
                  ))}
                </>
              )}
            </details>
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <details className="group">
              <summary className="font-display mb-0 flex cursor-pointer list-none items-center gap-2 text-[19px] italic marker:content-none group-open:mb-3.5">
                <IconSearch /> Buscar en el banco
              </summary>
              {meta.sources.length > 1 && (
                <div className="mb-3.5 flex flex-col gap-1.5">
                  <Label>Fuente</Label>
                  <Select value={searchSource} onValueChange={v => { setSearchSource(v); runSearch(searchQuery, v, searchTopic); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Todas">Todas las fuentes</SelectItem>
                      {meta.sources.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {meta.topics.length > 1 && (
                <div className="mb-3.5 flex flex-col gap-1.5">
                  <Label>Tema</Label>
                  <Select value={searchTopic} onValueChange={v => { setSearchTopic(v); runSearch(searchQuery, searchSource, v); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Todos">Todos los temas</SelectItem>
                      {meta.topics.map(t => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Input
                type="text"
                placeholder="Buscar por texto de pregunta, opción o explicación..."
                value={searchQuery}
                onChange={e => runSearch(e.target.value)}
              />
              {searchQuery.trim().length >= 2 && (
                <div className="mt-2.5 max-h-[380px] overflow-y-auto border-t border-border/60 pt-2.5">
                  {searching ? (
                    <p className="text-[13.5px] text-muted-foreground">Buscando…</p>
                  ) : searchResults.length === 0 ? (
                    <p className="text-[13.5px] text-muted-foreground">Sin resultados para &quot;{searchQuery}&quot;.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-[13.5px] text-muted-foreground">{searchResults.length} resultado{searchResults.length === 1 ? '' : 's'}</p>
                      {searchResults.map(item => {
                        const key = `option_${item.correct.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
                        return (
                          <div key={item.id} className="border-b border-border/60 py-2.5 text-[13.5px] last:border-b-0">
                            <div className="mb-[3px] text-foreground">{item.question}</div>
                            <div className="text-[11px] text-muted-foreground">✅ {item.correct}) {item[key]} · {item.source} · {item.topic}</div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <details className="group">
              <summary className="font-display mb-0 flex cursor-pointer list-none items-center gap-2 text-[19px] italic marker:content-none group-open:mb-3.5">
                <IconHistory /> Historial de exámenes
              </summary>
              {loadingHistory ? (
                <p className="text-[13.5px] text-muted-foreground">Cargando…</p>
              ) : history.length === 0 ? (
                <p className="text-[13.5px] text-muted-foreground">Todavía no has realizado ningún examen.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map(h => {
                    const passed = h.score >= h.pass_mark;
                    return (
                      <div
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-input px-3.5 py-[11px] transition-colors hover:shadow-sm"
                      >
                        <div className="flex flex-col gap-[3px]">
                          <span className="font-mono text-[11.5px] text-muted-foreground">{formatDate(h.created_at)} · {formatDuration(h.duration_ms)}</span>
                          <span className={cn('text-[13.5px] font-bold', passed ? 'text-success' : 'text-destructive')}>
                            {h.correct}/{h.total} · {h.score}% {passed ? '· Apto' : '· No apto'}
                          </span>
                          {(h.source_filter || h.topic_filter) && (
                            <Badge variant="secondary" className="mt-1 w-fit">
                              {[h.source_filter, h.topic_filter].filter(Boolean).join(' · ')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" variant="secondary" size="auto" onClick={() => handleRepeat(h)}>
                            ↻ Repetir
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Eliminar examen"
                            onClick={() => handleDeleteAttempt(h)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrendChart({ history }: { history: ExamAttempt[] }) {
  const chrono = history.slice().reverse();
  const n = chrono.length;
  if (n < 2) return null;

  const W = 640, H = 220, padL = 34, padR = 14, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (pct: number) => padT + plotH - (pct / 100) * plotH;

  const scores = chrono.map(e => e.score);
  const windowSize = 5;
  const movingAvg = scores.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = scores.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const avgPassMark = Math.round(chrono.reduce((s, e) => s + e.pass_mark, 0) / n);

  const scoreLine = chrono.map((e, i) => `${x(i).toFixed(1)},${y(e.score).toFixed(1)}`).join(' ');
  const avgLine = movingAvg.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const firstDate = new Date(chrono[0].created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  const lastDate = new Date(chrono[n - 1].created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

  return (
    <>
      <p className="mb-1.5 text-[13.5px] text-muted-foreground"><strong>Evolución de resultados:</strong></p>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de resultados de los exámenes">
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line className="trend-grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="trend-axis" x={padL - 6} y={y(v) + 3} textAnchor="end">{v}</text>
          </g>
        ))}
        <line className="trend-pass-line" x1={padL} y1={y(avgPassMark)} x2={W - padR} y2={y(avgPassMark)} />
        <polyline className="trend-line" points={scoreLine} />
        <polyline className="trend-avg-line" points={avgLine} />
        {chrono.map((e, i) => (
          <circle key={e.id} className={`trend-dot ${e.score >= e.pass_mark ? 'ok' : 'ko'}`} cx={x(i)} cy={y(e.score)} r={4} />
        ))}
        <text className="trend-axis" x={padL} y={H - 8} textAnchor="start">{firstDate}</text>
        <text className="trend-axis" x={W - padR} y={H - 8} textAnchor="end">{lastDate}</text>
      </svg>
      <div className="trend-legend">
        <span><i className="trend-swatch line" />Nota por examen</span>
        <span><i className="trend-swatch avg" />Media móvil (últimos 5)</span>
        <span><i className="trend-swatch pass" />Nota de corte media ({avgPassMark}%)</span>
      </div>
    </>
  );
}

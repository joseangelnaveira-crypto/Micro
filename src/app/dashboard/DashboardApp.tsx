'use client';

import { useEffect, useRef, useState } from 'react';
import type { Question, ExamAttempt, BankMeta, FinishExamPayload } from '@/lib/exam-types';
import { startExam, startReviewExam, startSmartReview, startOfficialExam, startDueReview, getDueCount, finishExam, getHistory, getStudyStats, searchQuestions, getCycleProgress, deleteExamAttempt, reportQuestionError, setExamDate as setExamDateAction, getStreak, type StudyStats, type StreakInfo } from './actions';
import {
  offlineStartExam, offlineStartReviewExam, offlineStartSmartReview, offlineSearchQuestions,
} from '@/lib/offline/exam-engine';
import { isBankReady, downloadBank, queueAttempt, hasPendingSync, drainQueue } from '@/lib/offline/sync';
import DashboardHeader, { type HeaderTarget } from '@/components/DashboardHeader';
import AnimatedNumber from '@/components/AnimatedNumber';
import { scoreAttempt, PENALTY_OPTIONS } from '@/lib/exam-utils';
import { IconBook, IconFlask, IconChart, IconSearch, IconHistory, IconPetri } from '@/components/Icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, WifiOff, Trash2, Bell, BellOff, Check, X, Flag, Flame, FlaskConical, History as HistoryIcon, BarChart3, Zap, TriangleAlert } from 'lucide-react';
import CommandPalette, { type PaletteAction } from '@/components/CommandPalette';
import Confetti from '@/components/Confetti';
import QuestionText from '@/components/QuestionText';
import QuestionNote from '@/components/QuestionNote';
import ExamReview, { type ReviewItem } from './ExamReview';
import StudyInsights from './StudyInsights';
import { formatDuration, formatDate, examComposition, StatBlock, CompositionTags, TrendChart } from './dashboard-parts';

import { hasPushSubscription } from './push-actions';
import { enableReminders, disableReminders } from '@/lib/push-client';

type Screen = 'home' | 'exam' | 'results' | 'review';

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
  timeLimitMinutes?: number;
  penalty?: number;
  realMode?: boolean;
  realAnswers?: Record<string, string>;
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

export default function DashboardApp({
  displayName, isAdmin, initialMeta, userId, initialExamDate,
}: {
  displayName: string;
  isAdmin: boolean;
  initialMeta: BankMeta;
  userId: string;
  initialExamDate: string | null;
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

  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const [examDate, setExamDate] = useState<string | null>(initialExamDate);
  const [editingExamDate, setEditingExamDate] = useState(false);
  const [examDateDraft, setExamDateDraft] = useState(initialExamDate ?? '');
  const [savingExamDate, setSavingExamDate] = useState(false);

  // Modo simulacro: cronómetro real que termina el examen automáticamente al llegar a 0.
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0); // 0 = sin límite
  const timeLimitRef = useRef<number>(0);
  // Penalización por fallo (acierto que resta cada fallo; 0 = ninguna). Se congela por examen.
  const [penalty, setPenalty] = useState(0);
  const penaltyRef = useRef<number>(0);
  const [dueCount, setDueCount] = useState(0);
  // Modo examen real: sin corrección inmediata; puedes ir y volver entre preguntas y cambiar respuestas.
  // La corrección y las explicaciones llegan al terminar. El simulacro oficial lo usa siempre.
  const [realMode, setRealMode] = useState(false);
  const realModeRef = useRef(false);
  const [realAnswers, setRealAnswers] = useState<Record<string, string>>({});
  const finishRef = useRef<(override?: Result[]) => Promise<void>>(async () => {});

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

  useEffect(() => { if (isOnline) getDueCount().then(setDueCount).catch(() => {}); }, [isOnline, screen]);

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

    // Ctrl/Cmd+K abre el buscador global
    function handleCmdK(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCommandOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', handleCmdK);

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
      window.removeEventListener('keydown', handleCmdK);
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

  async function saveExamDate() {
    setSavingExamDate(true);
    try {
      const value = examDateDraft.trim() || null;
      await setExamDateAction(value);
      setExamDate(value);
      setEditingExamDate(false);
    } catch (err) {
      showAlert(err instanceof Error ? err.message : 'No se ha podido guardar la fecha.');
    }
    setSavingExamDate(false);
  }

  function daysUntilExam(): number | null {
    if (!examDate) return null;
    const target = new Date(examDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }

  function buildPaletteActions(): PaletteAction[] {
    return [
      { id: 'start-exam', label: 'Empezar examen nuevo', icon: <FlaskConical className="size-4" />, hint: '', onRun: () => handleStartExam() },
      { id: 'smart', label: 'Repaso inteligente', icon: <Zap className="size-4" />, onRun: () => handleSmartReview() },
      { id: 'history', label: 'Ver historial de exámenes', icon: <HistoryIcon className="size-4" />, onRun: () => { const el = document.getElementById('section-history'); el?.scrollIntoView({ behavior: 'smooth' }); (el?.querySelector('details') as HTMLDetailsElement | null)?.setAttribute('open', ''); } },
      { id: 'stats', label: 'Ver estadísticas', icon: <BarChart3 className="size-4" />, onRun: () => { const el = document.getElementById('section-stats'); el?.scrollIntoView({ behavior: 'smooth' }); (el?.querySelector('details') as HTMLDetailsElement | null)?.setAttribute('open', ''); } },
      { id: 'theme', label: darkMode ? 'Modo claro' : 'Modo oscuro', icon: darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />, onRun: () => toggleDarkMode() },
      { id: 'reminders', label: remindersEnabled ? 'Desactivar recordatorios' : 'Activar recordatorios', icon: remindersEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />, onRun: () => toggleReminders() },
    ];
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
    getStreak().then(setStreak).catch(() => { /* noop */ });
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
    timerRef.current = setInterval(() => {
      forceTick();
      if (timeLimitRef.current > 0 && currentElapsed() >= timeLimitRef.current * 60 * 1000) {
        // Se acabó el tiempo -- terminamos el examen tal como esté.
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        finishRef.current();
      }
    }, 1000);
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
      timeLimitMinutes: timeLimitRef.current,
      penalty: penaltyRef.current,
      realMode: realModeRef.current,
      realAnswers,
      ...overrides,
    };
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload)); } catch { /* noop */ }
  }
  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch { /* noop */ }
    setSavedProgress(null);
  }

  function handleStart(questions: Question[], affectsCycle = true, forceReal?: boolean) {
    if (questions.length === 0) return;
    clientUuidRef.current = crypto.randomUUID();
    affectsCycleRef.current = affectsCycle;
    timeLimitRef.current = timeLimitMinutes; // se congela para este examen
    penaltyRef.current = penalty;
    realModeRef.current = forceReal ?? realMode;
    setRealAnswers({});
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

  async function handleOfficialExam() {
    if (sourceFilter === 'Todas') {
      showAlert('Elige primero en «Fuente» el examen oficial que quieres simular.');
      return;
    }
    if (!isOnline) { showAlert('El simulacro oficial necesita conexión para cargar el examen en su orden original.'); return; }
    setStarting(true);
    const questions = await startOfficialExam(sourceFilter);
    setStarting(false);
    if (questions.length === 0) { showAlert('Ese lote no tiene preguntas.'); return; }
    handleStart(questions, false, true);
  }

  /** Plan diario: reparte las preguntas aún sin ver entre los días que quedan (dejando ~15 % para repasar). */
  function dailyPlan(): { days: number; newPerDay: number } | null {
    const days = daysUntilExam();
    if (days === null || days <= 0 || !globalCycle || globalCycle.unseen === 0) return null;
    const studyDays = Math.max(1, Math.floor(days * 0.85));
    return { days, newPerDay: Math.max(1, Math.ceil(globalCycle.unseen / studyDays)) };
  }

  async function handleDailyPlan() {
    const plan = dailyPlan();
    if (!plan) return;
    setStarting(true);
    const params = { numQuestions: plan.newPerDay, source: null, topic: null };
    const questions = isOnline ? await startExam(params) : await offlineStartExam(params);
    setStarting(false);
    if (questions.length === 0) { if (!isOnline) offlineBankBlocked(); return; }
    handleStart(questions, true);
  }

  async function handleTopicPractice(topic: string) {
    setStarting(true);
    const params = { numQuestions: 30, source: null, topic };
    const questions = isOnline ? await startSmartReview(params) : await offlineStartSmartReview(params);
    setStarting(false);
    if (questions.length === 0) { if (!isOnline) offlineBankBlocked(); return; }
    handleStart(questions, false);
  }

  async function handleDueReview() {
    if (!isOnline) { showAlert('El repaso espaciado necesita conexión.'); return; }
    setStarting(true);
    const questions = await startDueReview(numQuestions);
    setStarting(false);
    if (questions.length === 0) { showAlert('No tienes preguntas pendientes de repaso para hoy. Vuelve mañana o haz un examen.'); return; }
    handleStart(questions, false);
  }

  // Revisar un examen ya terminado (desde el historial): tus respuestas, la corrección y las explicaciones.
  const [reviewAttempt, setReviewAttempt] = useState<{ attempt: ExamAttempt; items: ReviewItem[] } | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  async function handleReviewAttempt(attempt: ExamAttempt) {
    setLoadingReview(true);
    const questions = isOnline
      ? await startReviewExam(attempt.question_ids)
      : await offlineStartReviewExam(attempt.question_ids);
    setLoadingReview(false);
    if (questions.length === 0) {
      showAlert('No se han podido cargar las preguntas de este examen (puede que alguna se haya borrado del banco).');
      return;
    }
    const byId = new Map(questions.map(q => [q.id, q]));
    const items: ReviewItem[] = attempt.question_ids.flatMap((id, i) => {
      const q = byId.get(id);
      if (!q) return [];
      const selected = attempt.answers[i] ?? null;
      return [{ question: q, selected, isCorrect: selected !== null && selected === q.correct }];
    });
    setReviewAttempt({ attempt, items });
    setScreen('review');
    window.scrollTo({ top: 0 });
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
    timeLimitRef.current = savedProgress.timeLimitMinutes ?? 0;
    penaltyRef.current = savedProgress.penalty ?? 0;
    realModeRef.current = savedProgress.realMode ?? false;
    setRealAnswers(savedProgress.realAnswers ?? {});
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
    if (realModeRef.current) {
      const qid = examQuestions[currentIndex].id;
      const next = { ...realAnswers };
      if (next[qid] === letter) delete next[qid]; else next[qid] = letter; // pulsar otra vez = dejar en blanco
      setRealAnswers(next);
      persistProgress({ realAnswers: next });
      return;
    }
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

  function goTo(index: number) {
    if (index < 0 || index >= examQuestions.length) return;
    setCurrentIndex(index);
    persistProgress({ currentIndex: index });
  }

  function buildRealResults(): Result[] {
    return examQuestions.map(q => ({
      question: q,
      selected: realAnswers[q.id] ?? null,
      isCorrect: realAnswers[q.id] === q.correct,
    }));
  }

  function finishReal() {
    const unanswered = examQuestions.filter(q => !realAnswers[q.id]).length;
    const run = () => { const res = buildRealResults(); setResults(res); finish(res); };
    if (unanswered > 0) {
      showConfirm(
        `Te quedan ${unanswered} ${unanswered === 1 ? 'pregunta' : 'preguntas'} sin contestar. ¿Terminar el examen igualmente?`,
        run,
        { confirmLabel: 'Terminar' }
      );
    } else run();
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

  // Atajos de teclado durante el examen: A/B/C/D o 1/2/3/4 seleccionan; Enter/→/Espacio
  // pasan a la siguiente cuando ya se ha respondido. No hace nada si el foco está en un
  // input/textarea/select (por ejemplo un diálogo abierto por encima).
  useEffect(() => {
    if (screen !== 'exam') return;
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target && target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const letterMap: Record<string, string> = {
        a: 'A', b: 'B', c: 'C', d: 'D',
        '1': 'A', '2': 'B', '3': 'C', '4': 'D',
      };
      const key = e.key.toLowerCase();
      if (realModeRef.current) {
        if (letterMap[key]) { e.preventDefault(); selectOption(letterMap[key]); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex - 1); }
        return;
      }
      if (!checked && letterMap[key]) {
        e.preventDefault();
        selectOption(letterMap[key]);
        return;
      }
      if (checked && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ')) {
        e.preventDefault();
        nextQuestion();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, checked, currentIndex, realAnswers]);

  async function finish(override?: Result[]) {
    stopTimer();
    setFinishing(true);
    const finalResults = override ?? (realModeRef.current ? buildRealResults() : results);
    if (override || realModeRef.current) setResults(finalResults);
    const questionIds = examQuestions.map(q => q.id);
    const sortedResults = finalResults
      .slice()
      .sort((a, b) => questionIds.indexOf(a.question.id) - questionIds.indexOf(b.question.id));
    const answers = sortedResults.map(r => r.selected);
    const correctByQuestion = examQuestions.map(q => {
      const r = finalResults.find(res => res.question.id === q.id);
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
      penalty: penaltyRef.current,
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
    // Celebración: solo si aprobado y hito reconocible (perfecto o supera por 20+ puntos).
    const passed = attempt.score >= attempt.pass_mark;
    const perfect = attempt.score === 100;
    const strong = passed && attempt.score - attempt.pass_mark >= 20;
    if (perfect || strong) setConfettiTrigger(c => c + 1);
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

  finishRef.current = finish;

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
  const homeContainer = 'mx-auto max-w-[1040px] px-3.5 pt-5 pb-12 md:px-5 md:pt-8 md:pb-16';

  function goToSection(target: HeaderTarget) {
    if (target === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = document.getElementById(target === 'stats' ? 'section-stats' : 'section-history');
    if (!el) return;
    (el.querySelector('details') as HTMLDetailsElement | null)?.setAttribute('open', '');
    // pequeño margen para que la cabecera sticky no tape el título
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  if (screen === 'exam') {
    const q = examQuestions[currentIndex];
    const total = examQuestions.length;
    const real = realModeRef.current;
    const answeredCount = real ? Object.keys(realAnswers).length : results.length;
    const scoreSoFar = results.filter(r => r.isCorrect).length;
    const pct = Math.round(((real ? answeredCount : currentIndex) / total) * 100);
    const mineNow = real ? realAnswers[q.id] ?? null : null;
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
              {timeLimitRef.current > 0 ? (() => {
                const remainingMs = Math.max(0, timeLimitRef.current * 60 * 1000 - currentElapsed());
                const soon = remainingMs <= 60 * 1000;
                return (
                  <span className={cn(soon && 'text-destructive')}>
                    ⏱ {formatDuration(remainingMs)}
                  </span>
                );
              })() : (
                <span>{formatDuration(currentElapsed())}</span>
              )}
              <span>{real ? `CONTESTADAS ${answeredCount}` : `ACIERTOS ${scoreSoFar}`}</span>
            </div>
            <div className="mb-4 h-[7px] overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-success to-warning transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {timeLimitRef.current > 0 && (() => {
              const expected = Math.floor((total * currentElapsed()) / (timeLimitRef.current * 60 * 1000));
              const diff = answeredCount - expected;
              return (
                <p className={cn('mb-3 text-[12.5px]', diff < -2 ? 'text-warning' : 'text-muted-foreground')}>
                  Ritmo: {diff >= 0 ? `vas ${diff} ${diff === 1 ? 'pregunta' : 'preguntas'} por delante` : `vas ${-diff} ${-diff === 1 ? 'pregunta' : 'preguntas'} por detrás`}
                  {' '}(deberías llevar {expected} contestadas).
                </p>
              );
            })()}
            {real && (
              <div className="mb-3.5 flex flex-wrap gap-1" role="group" aria-label="Ir a una pregunta">
                {examQuestions.map((qq, i) => (
                  <button
                    key={qq.id + i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Pregunta ${i + 1}${realAnswers[qq.id] ? ', contestada' : ', sin contestar'}${flagged.has(qq.id) ? ', marcada' : ''}`}
                    aria-current={i === currentIndex ? 'true' : undefined}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-lg border font-mono text-[11px] font-semibold transition-colors',
                      realAnswers[qq.id] ? 'border-secondary/40 bg-secondary/15 text-secondary' : 'border-border bg-background text-muted-foreground',
                      flagged.has(qq.id) && 'ring-2 ring-warning',
                      i === currentIndex && 'border-primary bg-primary text-primary-foreground'
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <div className={cn('mb-3.5 flex flex-wrap gap-1.5', real && 'hidden')}>
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
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <Badge variant="secondary" className="max-w-full whitespace-normal">{q.source} · {q.topic}</Badge>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => { setReportingQuestionId(q.id); setReportReason(''); }}
                >
                  <TriangleAlert className="size-4 sm:hidden" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Reportar error</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleFlag(q.id)}
                  className={isFlagged ? 'border-warning bg-warning/15 text-[#8a5a00] hover:bg-warning/20' : undefined}
                >
                  <Flag className={cn('size-3.5', isFlagged && 'fill-current')} />
                  {isFlagged ? 'Marcada' : 'Marcar'}
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
            <QuestionText text={q.question} className="mb-5 text-[19px] font-bold leading-relaxed tracking-tight sm:text-xl" caseClassName="mb-4" />

            <div className="flex flex-col gap-2">
              {options.map(([letter, text]) => {
                let stateClass = '';
                if (real && mineNow === letter) stateClass = 'border-secondary bg-secondary/10';
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
                      'flex w-full items-center gap-3 rounded-2xl border border-input bg-card px-4 py-3.5 text-left text-[15px] font-medium leading-snug text-foreground transition-all outline-none',
                      'hover:border-secondary hover:-translate-y-px hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-none',
                      'focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-secondary',
                      stateClass
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-7 flex-none items-center justify-center rounded-full bg-background font-mono text-xs font-extrabold text-muted-foreground transition-colors',
                        checked && letter === q.correct && 'bg-success text-success-foreground',
                        checked && letter === selected && letter !== q.correct && 'bg-destructive text-destructive-foreground'
                      )}
                      aria-label={
                        checked && letter === q.correct
                          ? `${letter} — respuesta correcta`
                          : checked && letter === selected && letter !== q.correct
                            ? `${letter} — respuesta incorrecta`
                            : letter
                      }
                    >
                      {checked && letter === q.correct ? (
                        <Check className="size-4" strokeWidth={3} />
                      ) : checked && letter === selected && letter !== q.correct ? (
                        <X className="size-4" strokeWidth={3} />
                      ) : (
                        letter
                      )}
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
                    {q.source_page && <span>Murray, Microbiología Médica 9.ª ed. · pág. {q.source_page}</span>}
                    {q.source_url && (
                      <a href={q.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-secondary hover:underline">
                        Leer más ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            {checked && <QuestionNote questionId={q.id} disabled={!isOnline} />}

            <p className="mt-4 hidden text-center text-[11.5px] text-muted-foreground md:block">
              Atajos: A/B/C/D o 1-4 para responder · Enter para siguiente
            </p>
            <div className="sticky bottom-2 z-10 -mx-2 mt-4 flex items-center justify-between gap-2.5 rounded-2xl bg-card/90 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/75">
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={requestExit} className="text-muted-foreground">
                  Salir
                </Button>
                {real && currentIndex + 1 < total && (
                  <Button type="button" variant="ghost" size="sm" disabled={finishing} onClick={finishReal} className="text-muted-foreground">
                    Terminar
                  </Button>
                )}
              </div>
              {real ? (
                <div className="flex flex-1 items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="auto" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
                    ← Anterior
                  </Button>
                  {currentIndex + 1 < total ? (
                    <Button type="button" size="auto" onClick={() => goTo(currentIndex + 1)}>Siguiente →</Button>
                  ) : (
                    <Button type="button" size="auto" disabled={finishing} onClick={finishReal}>
                      {finishing ? 'Guardando…' : 'Terminar examen'}
                    </Button>
                  )}
                </div>
              ) : checked && (
                <Button type="button" size="auto" className="flex-1 sm:flex-none" disabled={finishing} onClick={nextQuestion}>
                  {finishing ? 'Guardando…' : currentIndex + 1 >= total ? 'Ver resultados' : 'Siguiente pregunta →'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === 'review' && reviewAttempt) {
    const a = reviewAttempt.attempt;
    const passed = a.score >= a.pass_mark;
    return (
      <div className={container}>
        {modalNode}
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <h2 className="font-display text-[19px] italic">Revisión de examen</h2>
              <p className="font-mono text-[12px] text-muted-foreground">
                {formatDate(a.created_at)} · {formatDuration(a.duration_ms)}
              </p>
              <p className={cn('text-[14px] font-bold', passed ? 'text-success' : 'text-destructive')}>
                {a.correct}/{a.total} · {a.score}% {passed ? '· Apto' : '· No apto'}
              </p>
            </div>
            <Button type="button" variant="ghost" size="auto" onClick={() => { setReviewAttempt(null); setScreen('home'); }}>
              ← Volver al inicio
            </Button>
          </CardContent>
        </Card>
        <ExamReview items={reviewAttempt.items} flaggedIds={new Set(a.flagged_ids ?? [])} canTakeNotes={isOnline} />
      </div>
    );
  }

  if (screen === 'results' && lastAttempt) {
    const passed = lastAttempt.score >= lastAttempt.pass_mark;
    const failed = results.filter(r => !r.isCorrect);
    const composition = examComposition(examQuestions);

    // Mensaje personalizado basado en el histórico (hitos reales, no genéricos).
    const prevScores = history.map(h => h.score);
    const prevBest = prevScores.length ? Math.max(...prevScores) : null;
    const prevAvg = prevScores.length ? prevScores.reduce((s, v) => s + v, 0) / prevScores.length : null;
    let celebration: string | null = null;
    if (passed) {
      if (lastAttempt.score === 100) celebration = '¡Examen perfecto! Enhorabuena.';
      else if (prevBest !== null && lastAttempt.score > prevBest) celebration = `Nueva mejor nota — superas tu récord anterior (${prevBest}%).`;
      else if (prevAvg !== null && lastAttempt.score - prevAvg >= 15) celebration = 'Muy por encima de tu media. Vas afianzando.';
      else celebration = passed ? 'Aprobado. Buen ritmo.' : null;
    } else {
      celebration = 'Aún no es tu día — anota las falladas y vuelve pronto.';
    }

    return (
      <div className={container}>
        <Confetti trigger={confettiTrigger} />
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
            {celebration && (
              <p className={cn(
                'font-display mt-4 text-[18px] italic leading-snug',
                passed ? 'text-success' : 'text-muted-foreground'
              )}>
                {celebration}
              </p>
            )}
            <p className="mt-2 text-[13.5px] text-muted-foreground">Nota de corte: {lastAttempt.pass_mark}%{penaltyRef.current > 0 ? ` · cada fallo restó ${penaltyRef.current === 1 / 3 ? '1/3' : penaltyRef.current === 0.25 ? '1/4' : penaltyRef.current === 0.5 ? '1/2' : '1'} de acierto` : ''}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              <Button type="button" variant="ghost" size="auto" onClick={backHome}>Volver al inicio</Button>
              {flagged.size > 0 && (
                <Button type="button" variant="secondary" size="auto" onClick={reviewFlagged} className="gap-1.5">
                  <Flag className="size-3.5 fill-current" />
                  Repasar marcadas ({flagged.size})
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

        <ExamReview
          items={examQuestions.map(q => results.find(r => r.question.id === q.id) ?? { question: q, selected: null, isCorrect: false })}
          flaggedIds={flagged}
          canTakeNotes={isOnline}
        />
      </div>
    );
  }

  const smartAvailable = studyStats ? studyStats.totalAnswered > 0 : false;

  // Sugerencia "qué toca hoy": una sola recomendación clara en función del estado.
  // Priorizamos (en este orden): examen en curso > repaso inteligente si hay fallos >
  // completar racha > repasar preguntas marcadas > empezar un examen normal.
  function todaySuggestion(): { title: string; subtitle: string; cta: string; onRun: () => void } | null {
    if (savedProgress) {
      return {
        title: 'Tienes un examen a medias',
        subtitle: `Vas por la pregunta ${savedProgress.currentIndex + 1} de ${savedProgress.examQuestions.length}. Retómalo donde lo dejaste.`,
        cta: 'Continuar',
        onRun: resumeProgress,
      };
    }
    if (streak && !streak.todayDone && streak.current > 0) {
      return {
        title: `Mantén tu racha de ${streak.current} ${streak.current === 1 ? 'día' : 'días'}`,
        subtitle: 'Haz un examen hoy para no perderla. Puede ser corto.',
        cta: 'Empezar',
        onRun: handleStartExam,
      };
    }
    const plan = dailyPlan();
    if (plan) {
      return {
        title: `Plan de hoy: ${plan.newPerDay} preguntas nuevas${dueCount > 0 ? ` y ${dueCount} de repaso` : ''}`,
        subtitle: `Faltan ${plan.days} días para tu convocatoria: a este ritmo llegas con todo visto.`,
        cta: 'Empezar plan',
        onRun: handleDailyPlan,
      };
    }
    if (dueCount > 0) {
      return {
        title: `${dueCount} ${dueCount === 1 ? 'pregunta toca' : 'preguntas tocan'} repasarse hoy`,
        subtitle: 'La repetición espaciada las trae justo cuando estás a punto de olvidarlas.',
        cta: 'Repasar',
        onRun: handleDueReview,
      };
    }
    if (smartAvailable) {
      return {
        title: 'Repaso de lo que más te falla',
        subtitle: 'Prioriza preguntas con peor ratio de aciertos — rinde más que uno aleatorio.',
        cta: 'Repasar',
        onRun: handleSmartReview,
      };
    }
    if (flagged.size > 0) {
      return {
        title: `Preguntas marcadas (${flagged.size})`,
        subtitle: 'Lo que has dejado para repasar más tarde.',
        cta: 'Repasar marcadas',
        onRun: reviewFlagged,
      };
    }
    return {
      title: 'Empieza por un examen de prueba',
      subtitle: `Hay ${meta.total.toLocaleString('es-ES')} preguntas en el banco. Un examen te sitúa.`,
      cta: 'Empezar',
      onRun: handleStartExam,
    };
  }

  return (
    <>
      <DashboardHeader
        isAdmin={isAdmin}
        streak={streak}
        darkMode={darkMode}
        onToggleDark={toggleDarkMode}
        remindersEnabled={remindersEnabled}
        remindersBusy={remindersBusy}
        onToggleReminders={toggleReminders}
        onOpenSearch={() => setCommandOpen(true)}
        onNavigate={goToSection}
      />
      <div className={homeContainer}>
      {modalNode}
      <Confetti trigger={confettiTrigger} />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        actions={buildPaletteActions()}
        onSearch={async (q) => searchQuestions({ query: q, source: null, topic: null })}
      />

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

      {savedProgress ? (
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
      ) : (() => {
        const sug = todaySuggestion();
        if (!sug) return null;
        return (
          <Card className="card-lift anim-fade-up mb-4 relative overflow-hidden border-secondary/30 bg-gradient-to-br from-card via-card to-secondary/[0.04]" style={{ animationDelay: "40ms" }}>
            <span className="colony-blob" style={{ top: '-30px', right: '-30px', width: '150px', height: '150px', background: 'var(--colony)' }} />
            <span className="colony-blob" style={{ bottom: '-40px', right: '60px', width: '110px', height: '110px', background: 'var(--amber)' }} />
            <CardContent className="relative flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="min-w-0 flex-1">
                <p className="font-display mb-0.5 text-[11px] uppercase tracking-[1.5px] text-secondary">Hoy</p>
                <p className="font-display text-[20px] italic leading-snug text-foreground">{sug.title}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{sug.subtitle}</p>
              </div>
              <Button type="button" size="auto" onClick={sug.onRun} disabled={starting}>
                {starting ? 'Un momento…' : sug.cta}
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      <Card className="anim-fade-up mb-4" style={{ animationDelay: "80ms" }}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          {editingExamDate ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="exam-date" className="text-[13px] text-muted-foreground">Fecha de tu convocatoria</Label>
                <Input
                  id="exam-date"
                  type="date"
                  value={examDateDraft}
                  onChange={e => setExamDateDraft(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {examDate && (
                  <Button type="button" variant="ghost" size="sm" disabled={savingExamDate}
                    onClick={() => { setExamDateDraft(''); saveExamDate(); }}>
                    Quitar
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingExamDate(false); setExamDateDraft(examDate ?? ''); }}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={savingExamDate} onClick={saveExamDate}>
                  {savingExamDate ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </>
          ) : examDate ? (
            (() => {
              const days = daysUntilExam();
              if (days === null) return null;
              const label =
                days < 0 ? `La convocatoria fue hace ${-days} días` :
                days === 0 ? 'Hoy es tu convocatoria' :
                days === 1 ? 'Mañana es tu convocatoria' :
                `Faltan ${days} días para tu convocatoria`;
              const tone =
                days < 0 ? 'text-muted-foreground' :
                days <= 14 ? 'text-destructive' :
                days <= 60 ? 'text-warning' : 'text-secondary';
              return (
                <>
                  <div className="flex items-center gap-2">
                    <span className={cn('font-display text-[19px] italic', tone)}>{label}</span>
                    <span className="text-[12.5px] text-muted-foreground">
                      · {new Date(examDate + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {(() => {
                    const plan = dailyPlan();
                    if (!plan) return null;
                    return (
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
                        <span className="text-[13px] text-muted-foreground">
                          Plan de hoy: <b className="text-foreground">{plan.newPerDay}</b> nuevas
                          {dueCount > 0 && <> + <b className="text-foreground">{dueCount}</b> de repaso</>}
                        </span>
                        <Button type="button" size="sm" disabled={starting} onClick={handleDailyPlan}>Empezar plan</Button>
                      </div>
                    );
                  })()}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingExamDate(true)}>
                    Cambiar fecha
                  </Button>
                </>
              );
            })()
          ) : (
            <>
              <p className="text-[13.5px] text-muted-foreground">
                ¿Cuándo es tu convocatoria? Añádela y verás cuánto queda cada vez que entres.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingExamDate(true)}>
                Añadir fecha
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Banco: banda compacta a todo el ancho (cifras + lotes + progreso del ciclo) */}
      <Card className="card-lift anim-fade-up mb-4" style={{ animationDelay: '120ms' }}>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <IconBook />
              </span>
              <div>
                <CardTitle>Banco de preguntas</CardTitle>
                <p className="mt-1 text-[13px] text-muted-foreground">Bienvenido, {displayName}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-8">
              <StatBlock value={meta.total} label="en el banco" />
              <StatBlock value={globalCycle ? globalCycle.unseen : '…'} label="pendientes ciclo" />
            </div>
          </div>

          {globalCycle && globalCycle.total > 0 && (() => {
            const pct = Math.round(((globalCycle.total - globalCycle.unseen) / globalCycle.total) * 100);
            return (
              <div>
                <div className="mb-1.5 flex justify-between text-[11.5px] font-semibold text-muted-foreground">
                  <span>Ciclo completado</span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-success to-warning transition-[width] duration-1000 ease-out"
                    style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {meta.sources.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold uppercase tracking-[1px] text-muted-foreground marker:content-none">
                Lotes <span className="font-mono normal-case tracking-normal text-foreground">{meta.sources.length}</span>
                <span className="text-[11px] normal-case tracking-normal group-open:hidden">· mostrar</span>
                <span className="hidden text-[11px] normal-case tracking-normal group-open:inline">· ocultar</span>
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {meta.sources.map(s => (
                  <span key={s.name} className="rounded-full border border-border bg-background px-3 py-1 text-[12.5px] text-muted-foreground">
                    {s.name} <b className="font-mono text-foreground">{s.count}</b>
                  </span>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Generar examen: a todo el ancho, formulario en rejilla */}
      <Card className="card-lift anim-fade-up mb-4 border-secondary/40 bg-gradient-to-br from-card via-card to-secondary/[0.04]" style={{ animationDelay: '180ms' }}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <IconFlask />
            </span>
            <CardTitle>Generar examen</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {meta.sources.length > 1 && (
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
              <Label>Número de preguntas</Label>
              <Input
                type="number"
                min={1}
                value={numQuestions}
                onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          <details className="group mt-4 rounded-2xl border border-border bg-background/50 px-4 py-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] font-semibold marker:content-none">
              <span>Ajustes del examen</span>
              <span className="text-[12px] font-normal text-muted-foreground group-open:hidden">
                {realMode ? 'Corrección al final · ' : ''}Corte {passMark}% · {timeLimitMinutes > 0 ? `${timeLimitMinutes} min` : 'sin límite'} · {PENALTY_OPTIONS.find(o => o.value === penalty)?.label.toLowerCase() ?? 'sin penalización'}
              </span>
            </summary>
            <div className="mt-3 grid gap-x-4 gap-y-4 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] sm:col-span-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--secondary)]"
                checked={realMode}
                onChange={e => setRealMode(e.target.checked)}
              />
              <span>
                <b>Corrección al final</b> (como un examen real): puedes saltar preguntas, volver atrás y cambiar respuestas; la
                corrección y las explicaciones llegan al terminar.
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <Label>Nota de corte (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={passMark}
                onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tiempo límite (min · 0 = sin límite)</Label>
              <Input
                type="number"
                min={0}
                max={600}
                value={timeLimitMinutes}
                onChange={e => setTimeLimitMinutes(Math.max(0, Math.min(600, parseInt(e.target.value) || 0)))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Penalización por fallo</Label>
              <Select value={String(penalty)} onValueChange={v => setPenalty(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PENALTY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
          </details>

          {meta.total === 0 ? (
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
              Todavía no hay preguntas en el banco. {isAdmin ? (
                <a href="/admin/questions" className="font-bold text-secondary hover:underline">Impórtalas desde el panel de administrador</a>
              ) : 'Pídele al administrador que las suba.'}
            </p>
          ) : filterCycle && (
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
              Se generará un examen con {Math.min(numQuestions, filterCycle.total)} de las {filterCycle.total} preguntas disponibles
              {sourceFilter !== 'Todas' || topicFilter !== 'Todos' ? ' con este filtro' : ''} ({filterCycle.unseen} pendientes todavía en el ciclo).
            </p>
          )}

          <div className="mt-5">
            <Button type="button" size="lg" className="w-full" disabled={starting || meta.total === 0} onClick={handleStartExam}>
              {starting ? 'Generando…' : 'Empezar examen'}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button" variant="outline" size="sm"
              disabled={starting || !smartAvailable} onClick={handleSmartReview}
              title="Prioriza las preguntas con más fallos"
            >
              Repaso inteligente
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              disabled={starting || sourceFilter === 'Todas'} onClick={handleOfficialExam}
              title="Elige un examen en «Fuente»: se carga entero y en su orden original"
            >
              Simulacro oficial
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              disabled={starting || dueCount === 0} onClick={handleDueReview}
              title="Preguntas que la repetición espaciada te toca ver hoy"
            >
              Repaso espaciado{dueCount > 0 ? ` (${dueCount})` : ''}
            </Button>
          </div>
          <p className="mt-2.5 text-[12.5px] text-muted-foreground">
            {sourceFilter === 'Todas' ? 'Para el simulacro oficial elige antes un examen en «Fuente».' : 'El simulacro oficial usa la nota de corte, el tiempo y la penalización de arriba.'}
            {!smartAvailable && ' El repaso inteligente se activa al responder tus primeras preguntas.'}
          </p>
        </CardContent>
      </Card>

      {studyStats && studyStats.totalAnswered > 0 && (
        <Card id="section-stats" className="anim-fade-up mb-4" style={{ animationDelay: "240ms" }}>
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
                      {streak && (
                        <StatBlock
                          value={
                            <span className="flex items-center gap-1.5">
                              <Flame className={cn('size-4', streak.todayDone ? 'fill-warning text-warning' : 'text-warning/60')} />
                              {streak.current}
                            </span>
                          }
                          label={streak.current === 1 ? 'día de racha' : 'días de racha'}
                        />
                      )}
                    </div>
                    <p className="mb-5 text-[13.5px] leading-relaxed text-muted-foreground">
                      {passCount} de {totalExams} exámenes por encima de la nota de corte · {studyStats.totalAnswered} preguntas respondidas en total.
                      {streak && streak.longest > streak.current && streak.longest > 2 && (
                        <> · Tu mejor racha fueron {streak.longest} días.</>
                      )}
                    </p>
                  </>
                );
              })()}
              <TrendChart history={history} />
              <StudyInsights stats={studyStats} busy={starting} onPractice={handleTopicPractice} />
            </details>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
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
                            <div className="mb-[3px] whitespace-pre-line text-foreground">{item.question}</div>
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

        <Card id="section-history" className="anim-fade-up" style={{ animationDelay: "320ms" }}>
          <CardContent className="pt-6">
            <details className="group">
              <summary className="font-display mb-0 flex cursor-pointer list-none items-center gap-2 text-[19px] italic marker:content-none group-open:mb-3.5">
                <IconHistory /> Historial de exámenes
              </summary>
              {loadingHistory ? (
                <p className="text-[13.5px] text-muted-foreground">Cargando…</p>
              ) : history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                  <p className="mb-1 text-[14px] font-semibold">Todavía no hay exámenes en tu historial</p>
                  <p className="text-[13px] text-muted-foreground">
                    Cuando termines uno aparecerá aquí, con la opción de repetirlo tal cual y de ver cómo evoluciona tu nota.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map(h => {
                    const passed = h.score >= h.pass_mark;
                    const perQuestionSec = h.total > 0 ? Math.round(h.duration_ms / h.total / 1000) : 0;
                    return (
                      <div
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-input px-3.5 py-[11px] transition-colors hover:shadow-sm"
                      >
                        <div className="flex flex-col gap-[3px]">
                          <span className="font-mono text-[11.5px] text-muted-foreground">
                            {formatDate(h.created_at)} · {formatDuration(h.duration_ms)}
                            {perQuestionSec > 0 && <> · ~{perQuestionSec}s/preg.</>}
                          </span>
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
                          <Button type="button" variant="outline" size="auto" disabled={loadingReview} onClick={() => handleReviewAttempt(h)}>
                            Revisar
                          </Button>
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
    </>
  );
}

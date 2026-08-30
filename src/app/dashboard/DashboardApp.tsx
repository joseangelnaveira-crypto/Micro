'use client';

import { useEffect, useRef, useState } from 'react';
import type { Question, ExamAttempt, BankMeta } from '@/lib/exam-types';
import { startExam, startReviewExam, startSmartReview, finishExam, getHistory, getStudyStats, searchQuestions, getCycleProgress, type StudyStats } from './actions';
import { IconBook, IconFlask, IconChart, IconSearch, IconHistory } from '@/components/Icons';
import SignOutButton from '@/components/SignOutButton';

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

export default function DashboardApp({
  displayName, isAdmin, initialMeta,
}: {
  displayName: string;
  isAdmin: boolean;
  initialMeta: BankMeta;
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

  const [modal, setModal] = useState<Modal | null>(null);
  function showConfirm(message: string, onConfirm: () => void, opts?: { confirmLabel?: string; danger?: boolean }) {
    setModal({ message, type: 'confirm', onConfirm, confirmLabel: opts?.confirmLabel ?? 'Confirmar', danger: opts?.danger });
  }
  function showAlert(message: string) {
    setModal({ message, type: 'alert' });
  }

  useEffect(() => {
    refreshHistory();
    refreshStats();
    getCycleProgress().then(setGlobalCycle);

    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) setSavedProgress(JSON.parse(raw));
    } catch { /* noop */ }

    try {
      const dm = localStorage.getItem(DARK_MODE_KEY) === '1';
      setDarkMode(dm);
      document.body.classList.toggle('dark-mode', dm);
    } catch { /* noop */ }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
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

  async function handleStartExam() {
    setStarting(true);
    const questions = await startExam({
      numQuestions,
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    });
    setStarting(false);
    if (questions.length === 0) {
      showAlert('No hay preguntas que coincidan con ese filtro de fuente y tema. Prueba a ampliarlo.');
      return;
    }
    handleStart(questions, true);
  }

  async function handleSmartReview() {
    setStarting(true);
    const questions = await startSmartReview({
      numQuestions,
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    });
    setStarting(false);
    if (questions.length === 0) {
      showAlert('Todavía no hay suficiente historial de respuestas (con este filtro) para generar un repaso inteligente. Realiza al menos un examen primero.');
      return;
    }
    handleStart(questions, false);
  }

  async function handleRepeat(attempt: ExamAttempt) {
    const questions = await startReviewExam(attempt.question_ids);
    setPassMark(attempt.pass_mark);
    handleStart(questions, false);
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

    const attempt = await finishExam({
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
    });

    clearProgress();
    setLastAttempt(attempt);
    setFinishing(false);
    setScreen('results');
    refreshHistory();
    refreshStats();
    getCycleProgress().then(setGlobalCycle);
    getCycleProgress({
      source: sourceFilter === 'Todas' ? null : sourceFilter,
      topic: topicFilter === 'Todos' ? null : topicFilter,
    }).then(setFilterCycle);
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
    const questions = await startReviewExam(failedIds);
    handleStart(questions, false);
  }

  async function reviewFlagged() {
    const ids = [...flagged];
    if (ids.length === 0) return;
    const questions = await startReviewExam(ids);
    handleStart(questions, false);
  }

  const [searchSource, setSearchSource] = useState<string>('Todas');
  const [searchTopic, setSearchTopic] = useState<string>('Todos');

  async function runSearch(q: string, source = searchSource, topic = searchTopic) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await searchQuestions({
      query: q,
      source: source === 'Todas' ? null : source,
      topic: topic === 'Todos' ? null : topic,
    });
    setSearching(false);
    setSearchResults(res);
  }

  const modalNode = modal && (
    <div className="modal-backdrop">
      <div className="modal-box">
        <p className="modal-msg">{modal.message}</p>
        <div className="modal-actions">
          {modal.type === 'confirm' && (
            <button type="button" className="ghost" onClick={() => setModal(null)}>Cancelar</button>
          )}
          <button
            type="button"
            style={modal.type === 'confirm' && modal.danger ? { color: 'var(--contam)', borderColor: 'var(--contam)', background: 'transparent' } : undefined}
            onClick={() => { const cb = modal.onConfirm; setModal(null); cb?.(); }}
          >
            {modal.type === 'confirm' ? modal.confirmLabel : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );

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
      <div className="wrap wide">
        {modalNode}
        <div className="card pad-lg">
          <div className="qmeta">
            <span>PREGUNTA {currentIndex + 1} / {total}</span>
            <span>{formatDuration(currentElapsed())}</span>
            <span>ACIERTOS {scoreSoFar}</span>
          </div>
          <div className="progressbar"><div style={{ width: `${pct}%` }} /></div>
          <div className="trail">
            {examQuestions.map((qq, i) => {
              const r = results.find(res => res.question.id === qq.id);
              let cls = 'dot';
              if (r) cls += r.isCorrect ? ' ok' : ' ko';
              if (flagged.has(qq.id)) cls += ' flagged';
              return <span key={qq.id + i} className={cls} />;
            })}
          </div>
          {composition.length > 1 && (
            <div className="composition">
              {composition.map(([s, cnt]) => <span key={s} className="comp-tag">{s} <b>{cnt}</b></span>)}
            </div>
          )}
          <div className="qtoprow">
            <span className="source-tag">{q.source} · {q.topic}</span>
            <button type="button" className={`flag-btn ${isFlagged ? 'active' : ''}`} onClick={() => toggleFlag(q.id)}>
              {isFlagged ? '🚩 Marcada' : '🏳️ Marcar'}
            </button>
          </div>
          <p className="qtext">{q.question}</p>

          {options.map(([letter, text]) => {
            let cls = 'option';
            if (checked) {
              if (letter === q.correct) cls += ' correct';
              else if (letter === selected) cls += ' incorrect';
            }
            return (
              <button key={letter} type="button" className={cls} disabled={checked} onClick={() => selectOption(letter)}>
                <span className="letter">{letter}</span><span>{text}</span>
              </button>
            );
          })}

          {checked && (
            <div className={`feedback ${selected === q.correct ? 'ok' : 'ko'}`}>
              <span className="label">
                {selected === q.correct ? 'Respuesta correcta' : `Respuesta incorrecta · la correcta es ${q.correct}`}
              </span>
              {q.explanation || 'Sin explicación disponible para esta pregunta.'}
            </div>
          )}

          <div className="actions">
            <button type="button" className="ghost" style={{ width: 'auto' }} onClick={requestExit}>Salir</button>
            {checked && (
              <button type="button" style={{ width: 'auto' }} disabled={finishing} onClick={nextQuestion}>
                {finishing ? 'Guardando…' : currentIndex + 1 >= total ? 'Ver resultados' : 'Siguiente pregunta →'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'results' && lastAttempt) {
    const passed = lastAttempt.score >= lastAttempt.pass_mark;
    const failed = results.filter(r => !r.isCorrect);
    const composition = examComposition(examQuestions);

    return (
      <div className="wrap wide">
        {modalNode}
        <div className="card pad-lg" style={{ textAlign: 'center' }}>
          <h2 className="section">Resultados del examen</h2>
          <div
            className="result-ring"
            style={{ '--score': lastAttempt.score, '--ring-color': passed ? 'var(--colony)' : 'var(--contam)' } as React.CSSProperties}
          >
            <div className="result-ring-inner">
              <b>{lastAttempt.score}%</b>
              <span>{passed ? 'Apto' : 'No apto'}</span>
            </div>
          </div>
          <div className="stats-row" style={{ justifyContent: 'center' }}>
            <div className="stat"><b>{lastAttempt.correct}</b><span>correctas</span></div>
            <div className="stat"><b>{lastAttempt.incorrect}</b><span>incorrectas</span></div>
            <div className="stat"><b>{lastAttempt.total}</b><span>total</span></div>
            <div className="stat"><b>{formatDuration(lastAttempt.duration_ms)}</b><span>tiempo</span></div>
          </div>
          {composition.length > 1 && (
            <div className="composition" style={{ justifyContent: 'center' }}>
              {composition.map(([s, cnt]) => <span key={s} className="comp-tag">{s} <b>{cnt}</b></span>)}
            </div>
          )}
          <p className="hint">Nota de corte: {lastAttempt.pass_mark}%</p>
          <div className="actions" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="ghost" style={{ width: 'auto' }} onClick={backHome}>Volver al inicio</button>
            {flagged.size > 0 && (
              <button type="button" className="secondary" style={{ width: 'auto' }} onClick={reviewFlagged}>
                🚩 Repasar marcadas ({flagged.size})
              </button>
            )}
            {failed.length > 0 && (
              <button type="button" className="secondary" style={{ width: 'auto' }} onClick={reviewFailed}>
                Repasar falladas ({failed.length})
              </button>
            )}
            <button type="button" style={{ width: 'auto' }} onClick={handleStartExam}>Nuevo examen aleatorio</button>
          </div>
        </div>

        {failed.length > 0 ? (
          <div className="card pad-lg">
            <h2 className="section">Repaso de preguntas falladas</h2>
            {failed.map(r => {
              const opts: Record<string, string> = {
                A: r.question.option_a, B: r.question.option_b, C: r.question.option_c, D: r.question.option_d,
              };
              return (
                <div key={r.question.id} className="review-item">
                  <p className="qtext">{r.question.question}{flagged.has(r.question.id) ? ' 🚩' : ''}</p>
                  <div className="line you">
                    Tu respuesta: {r.selected ? `${r.selected}) ${opts[r.selected]}` : '(en blanco)'}
                  </div>
                  <div className="line right">Correcta: {r.question.correct}) {opts[r.question.correct]}</div>
                  <div className="expl">{r.question.explanation || 'Sin explicación disponible.'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card pad-lg">
            <h2 className="section">Examen perfecto</h2>
            <p className="hint">Has acertado todas las preguntas de este examen.</p>
          </div>
        )}
      </div>
    );
  }

  const smartAvailable = studyStats ? studyStats.totalAnswered > 0 : false;

  return (
    <div className="wrap wide">
      {modalNode}
      <div className="topbar">
        <div className="brand" style={{ marginBottom: 0 }}><h1>Academia de Microbiología</h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="view-toggle" onClick={toggleDarkMode} title="Modo oscuro">
            {darkMode ? '☀️' : '🌙'}
          </button>
          {isAdmin && <a href="/admin"><button type="button" className="ghost" style={{ width: 'auto' }}>Panel de administrador</button></a>}
          <SignOutButton />
        </div>
      </div>

      {savedProgress && (
        <div className="card pad-lg progress-card">
          <h2 className="section">Examen en curso</h2>
          <p className="hint">
            Te quedaste en la pregunta {savedProgress.currentIndex + 1} de {savedProgress.examQuestions.length}
            {' '}(guardado {formatDate(savedProgress.savedAt)}).
          </p>
          <div className="row">
            <button type="button" onClick={resumeProgress}>Continuar examen</button>
            <button type="button" className="ghost" onClick={discardProgress}>Descartar</button>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card pad-lg">
          <div className="section-title">
            <span className="icon-badge"><IconBook /></span>
            <h2 className="section">Banco de preguntas</h2>
          </div>
          <p className="hint" style={{ margin: '2px 0 14px' }}>Bienvenido, {displayName}</p>
          <div className="stats-row">
            <div className="stat"><b>{meta.total}</b><span>en el banco</span></div>
            <div className="stat"><b>{globalCycle ? globalCycle.unseen : '…'}</b><span>pendientes ciclo</span></div>
          </div>
          {meta.sources.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p className="hint" style={{ margin: '0 0 4px' }}>Preguntas por libro/lote:</p>
              {meta.sources.map(s => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--ink-soft)' }}>
                  <span>{s.name}</span><b style={{ color: 'var(--ink)' }}>{s.count}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card pad-lg hero">
          <div className="section-title">
            <span className="icon-badge"><IconFlask /></span>
            <h2 className="section">Generar examen</h2>
          </div>
          {meta.sources.length > 1 && (
            <>
              <label>Fuente</label>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                <option value="Todas">Todas las fuentes ({meta.total})</option>
                {meta.sources.map(s => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
              </select>
            </>
          )}
          {meta.topics.length > 1 && (
            <>
              <label>Tema</label>
              <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                <option value="Todos">Todos los temas</option>
                {meta.topics.map(t => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
              </select>
            </>
          )}
          <label>Número de preguntas</label>
          <div className="row" style={{ marginBottom: 14 }}>
            <input type="number" min={1} value={numQuestions} onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value) || 1))} />
            <button type="button" style={{ width: 'auto' }} disabled={starting || meta.total === 0} onClick={handleStartExam}>
              {starting ? 'Generando…' : 'Empezar examen'}
            </button>
          </div>
          {meta.total === 0 ? (
            <p className="hint">
              Todavía no hay preguntas en el banco. {isAdmin ? (
                <a href="/admin/questions" style={{ color: 'var(--violet)', fontWeight: 700 }}>Impórtalas desde el panel de administrador</a>
              ) : 'Pídele al administrador que las suba.'}
            </p>
          ) : filterCycle && (
            <p className="hint">
              Se generará un examen con {Math.min(numQuestions, filterCycle.total)} de las {filterCycle.total} preguntas disponibles
              {sourceFilter !== 'Todas' || topicFilter !== 'Todos' ? ' con este filtro' : ''} ({filterCycle.unseen} pendientes todavía en el ciclo).
            </p>
          )}
          <label>Nota de corte (%)</label>
          <input type="number" min={0} max={100} value={passMark} onChange={e => setPassMark(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} style={{ marginBottom: 14 }} />
          <button type="button" className="secondary block" disabled={starting || !smartAvailable} onClick={handleSmartReview}>
            Repaso inteligente (prioriza las preguntas con más fallos)
          </button>
          {!smartAvailable && <p className="hint" style={{ marginTop: 8 }}>Disponible en cuanto hayas respondido alguna pregunta.</p>}
        </div>
      </div>

      {studyStats && studyStats.totalAnswered > 0 && (
        <div className="card pad-lg">
          <details className="card-details">
            <summary style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <IconChart /> Estadísticas de estudio
            </summary>
            {(() => {
              const totalExams = history.length;
              const avgScore = totalExams ? Math.round(history.reduce((s, h) => s + h.score, 0) / totalExams) : null;
              const bestScore = totalExams ? Math.max(...history.map(h => h.score)) : null;
              const passCount = history.filter(h => h.score >= h.pass_mark).length;
              return (
                <>
                  <div className="stats-row">
                    <div className="stat"><b>{totalExams}</b><span>exámenes realizados</span></div>
                    <div className="stat"><b>{avgScore ?? '–'}%</b><span>nota media</span></div>
                    <div className="stat"><b>{bestScore ?? '–'}%</b><span>mejor nota</span></div>
                    <div className="stat"><b>{studyStats.overallAccuracy ?? '–'}%</b><span>acierto global</span></div>
                  </div>
                  <p className="hint">
                    {passCount} de {totalExams} exámenes por encima de la nota de corte · {studyStats.totalAnswered} preguntas respondidas en total.
                  </p>
                </>
              );
            })()}
            <TrendChart history={history} />
            {studyStats.topicRows.length > 0 && (
              <>
                <p className="hint" style={{ marginBottom: 6 }}><strong>Temas con mayor tasa de error:</strong></p>
                {studyStats.topicRows.map(r => (
                  <div key={r.topic} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--ink-soft)' }}>
                    <span>{r.topic}</span><b style={{ color: 'var(--ink)' }}>{r.pct}%</b>
                  </div>
                ))}
              </>
            )}
          </details>
        </div>
      )}

      <div className="grid-2">
        <div className="card pad-lg">
          <details className="card-details">
            <summary style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <IconSearch /> Buscar en el banco
            </summary>
            {meta.sources.length > 1 && (
              <>
                <label>Fuente</label>
                <select value={searchSource} onChange={e => { setSearchSource(e.target.value); runSearch(searchQuery, e.target.value, searchTopic); }}>
                  <option value="Todas">Todas las fuentes</option>
                  {meta.sources.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </>
            )}
            {meta.topics.length > 1 && (
              <>
                <label>Tema</label>
                <select value={searchTopic} onChange={e => { setSearchTopic(e.target.value); runSearch(searchQuery, searchSource, e.target.value); }}>
                  <option value="Todos">Todos los temas</option>
                  {meta.topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </>
            )}
            <input type="text" placeholder="Buscar por texto de pregunta, opción o explicación..." value={searchQuery} onChange={e => runSearch(e.target.value)} />
            {searchQuery.trim().length >= 2 && (
              <div className="search-results">
                {searching ? (
                  <p className="hint">Buscando…</p>
                ) : searchResults.length === 0 ? (
                  <p className="hint">Sin resultados para &quot;{searchQuery}&quot;.</p>
                ) : (
                  <>
                    <p className="hint" style={{ margin: '0 0 8px' }}>{searchResults.length} resultado{searchResults.length === 1 ? '' : 's'}</p>
                    {searchResults.map(item => {
                      const key = `option_${item.correct.toLowerCase()}` as 'option_a' | 'option_b' | 'option_c' | 'option_d';
                      return (
                        <div key={item.id} className="search-item">
                          <div className="sq-text">{item.question}</div>
                          <div className="sq-meta">✅ {item.correct}) {item[key]} · {item.source} · {item.topic}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </details>
        </div>

        <div className="card pad-lg">
          <details className="card-details">
            <summary style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <IconHistory /> Historial de exámenes
            </summary>
            {loadingHistory ? (
              <p className="hint">Cargando…</p>
            ) : history.length === 0 ? (
              <p className="hint">Todavía no has realizado ningún examen.</p>
            ) : (
              <div className="history-list">
                {history.map(h => {
                  const passed = h.score >= h.pass_mark;
                  return (
                    <div key={h.id} className="history-item">
                      <div className="history-info">
                        <span className="history-date">{formatDate(h.created_at)} · {formatDuration(h.duration_ms)}</span>
                        <span className={`history-score ${passed ? 'ok' : 'ko'}`}>
                          {h.correct}/{h.total} · {h.score}% {passed ? '· Apto' : '· No apto'}
                        </span>
                      {(h.source_filter || h.topic_filter) && (
                        <span className="source-tag" style={{ marginTop: 4 }}>
                          {[h.source_filter, h.topic_filter].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <button type="button" className="secondary" style={{ width: 'auto' }} onClick={() => handleRepeat(h)}>
                      ↻ Repetir
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </details>
      </div>
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
      <p className="hint" style={{ marginBottom: 6 }}><strong>Evolución de resultados:</strong></p>
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

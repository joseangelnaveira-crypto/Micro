import type { FinishExamPayload } from '@/lib/exam-types';
import { finishExam } from '@/app/dashboard/actions';
import { downloadQuestionBank, downloadUserStats } from '@/app/dashboard/offline-actions';
import {
  putQuestions, putQuestionStats, upsertQuestionStat, getAllQuestionStats,
  enqueueAttempt, dequeueAttempt, getAllPendingAttempts, getKv, setKv, wipeAll,
} from './db';
import { applyAttemptToStats } from '@/lib/exam-utils';

// Debe coincidir con DOC_CACHE en public/sw.js.
const DOC_CACHE_NAME = 'academia-docs-v1';

export async function isBankReady(bankTotal: number, userId: string): Promise<boolean> {
  const cachedUserId = await getKv('cachedUserId');
  const cachedTotal = await getKv('bankTotal');
  return cachedUserId === userId && cachedTotal === bankTotal;
}

export async function downloadBank(userId: string, bankTotal: number): Promise<void> {
  const cachedUserId = await getKv('cachedUserId');
  if (cachedUserId && cachedUserId !== userId) {
    await wipeAll();
    if ('caches' in window) {
      await caches.delete(DOC_CACHE_NAME).catch(() => { /* noop */ });
    }
  }

  const [questions, stats] = await Promise.all([downloadQuestionBank(), downloadUserStats()]);
  await putQuestions(questions);
  await putQuestionStats(stats);
  await setKv('bankTotal', bankTotal);
  await setKv('lastSyncAt', new Date().toISOString());
  await setKv('cachedUserId', userId);
}

export async function queueAttempt(payload: FinishExamPayload): Promise<void> {
  await enqueueAttempt(payload);

  const existingStats = await getAllQuestionStats();
  const byId = new Map(existingStats.map(s => [s.question_id, s]));
  for (let i = 0; i < payload.questionIds.length; i++) {
    const qId = payload.questionIds[i];
    const patch = applyAttemptToStats(byId.get(qId), payload.correctByQuestion[i], payload.affectsCycle);
    await upsertQuestionStat({ question_id: qId, ...patch });
  }
}

export async function hasPendingSync(): Promise<number> {
  return (await getAllPendingAttempts()).length;
}

export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  const pending = (await getAllPendingAttempts()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  let synced = 0;

  for (const attempt of pending) {
    try {
      await finishExam(attempt);
      await dequeueAttempt(attempt.clientUuid);
      synced++;
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_CLIENT_UUID') {
        await dequeueAttempt(attempt.clientUuid);
        synced++;
        continue;
      }
      // Error real (todavía sin conexión, fallo del servidor): se corta aquí para
      // conservar el orden cronológico en el próximo intento.
      return { synced, failed: pending.length - synced };
    }
  }

  return { synced, failed: 0 };
}

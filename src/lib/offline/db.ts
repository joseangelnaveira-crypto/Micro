import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Question, QuestionStat, FinishExamPayload } from '@/lib/exam-types';

type PendingAttempt = FinishExamPayload & { queuedAt: string };

interface AcademiaOfflineDB extends DBSchema {
  questions: { key: string; value: Question; indexes: { source: string; topic: string } };
  question_stats: { key: string; value: QuestionStat };
  pending_attempts: { key: string; value: PendingAttempt };
  kv: { key: string; value: { key: string; value: string | number } };
}

let dbPromise: Promise<IDBPDatabase<AcademiaOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AcademiaOfflineDB>('academia-offline', 1, {
      upgrade(db) {
        const questions = db.createObjectStore('questions', { keyPath: 'id' });
        questions.createIndex('source', 'source');
        questions.createIndex('topic', 'topic');
        db.createObjectStore('question_stats', { keyPath: 'question_id' });
        db.createObjectStore('pending_attempts', { keyPath: 'clientUuid' });
        db.createObjectStore('kv', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function getAllQuestions(): Promise<Question[]> {
  return (await getDb()).getAll('questions');
}

export async function putQuestions(rows: Question[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('questions', 'readwrite');
  await Promise.all(rows.map(r => tx.store.put(r)));
  await tx.done;
}

export async function getAllQuestionStats(): Promise<QuestionStat[]> {
  return (await getDb()).getAll('question_stats');
}

export async function putQuestionStats(rows: QuestionStat[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('question_stats', 'readwrite');
  await Promise.all(rows.map(r => tx.store.put(r)));
  await tx.done;
}

export async function upsertQuestionStat(patch: QuestionStat): Promise<void> {
  const db = await getDb();
  await db.put('question_stats', patch);
}

export async function enqueueAttempt(payload: FinishExamPayload): Promise<void> {
  const db = await getDb();
  await db.put('pending_attempts', { ...payload, queuedAt: new Date().toISOString() });
}

export async function dequeueAttempt(clientUuid: string): Promise<void> {
  const db = await getDb();
  await db.delete('pending_attempts', clientUuid);
}

export async function getAllPendingAttempts(): Promise<PendingAttempt[]> {
  return (await getDb()).getAll('pending_attempts');
}

export async function getKv(key: string): Promise<string | number | undefined> {
  const db = await getDb();
  const row = await db.get('kv', key);
  return row?.value;
}

export async function setKv(key: string, value: string | number): Promise<void> {
  const db = await getDb();
  await db.put('kv', { key, value });
}

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear('questions'),
    db.clear('question_stats'),
    db.clear('pending_attempts'),
    db.clear('kv'),
  ]);
}

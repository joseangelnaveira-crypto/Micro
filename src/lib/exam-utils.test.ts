import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAttempt, nextSrsState, applyAttemptToStats } from './exam-utils';

const base = { questionIds: ['a', 'b', 'c', 'd'], answers: ['A', 'B', null, 'D'] };

test('sin penalización: nota = aciertos / total', () => {
  const r = scoreAttempt({ ...base, correctByQuestion: [true, true, false, false] });
  assert.deepEqual(r, { total: 4, correct: 2, incorrect: 1, blank: 1, score: 50 });
});

test('la penalización resta por fallo y no por blanco', () => {
  const r = scoreAttempt({ ...base, correctByQuestion: [true, true, false, false], penalty: 0.5 });
  assert.equal(r.score, Math.round(((2 - 0.5) / 4) * 100));
});

test('la nota nunca baja de 0', () => {
  const r = scoreAttempt({ questionIds: ['a', 'b'], answers: ['A', 'A'], correctByQuestion: [false, false], penalty: 1 });
  assert.equal(r.score, 0);
});

test('SRS: acierto alarga el intervalo, fallo lo reinicia', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const s1 = nextSrsState(null, true, now);
  assert.equal(s1.interval_days, 1);
  const s2 = nextSrsState(s1, true, now);
  assert.equal(s2.interval_days, 3);
  const s3 = nextSrsState(s2, true, now);
  assert.ok(s3.interval_days > 3);
  const f = nextSrsState(s3, false, now);
  assert.equal(f.interval_days, 1);
  assert.ok(f.ease < s3.ease && f.ease >= 1.3);
});

test('last_seen_at solo cambia si el examen afecta al ciclo', () => {
  const prev = { seen: 1, correct: 1, last_seen_at: '2025-01-01T00:00:00Z' };
  assert.equal(applyAttemptToStats(prev, true, false).last_seen_at, prev.last_seen_at);
  assert.notEqual(applyAttemptToStats(prev, true, true).last_seen_at, prev.last_seen_at);
});

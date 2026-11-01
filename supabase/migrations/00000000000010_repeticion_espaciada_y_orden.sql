-- Repetición espaciada (estilo SM-2 simplificado) y orden original de las preguntas de un examen.
-- Pegar en el SQL Editor de Supabase. Es idempotente (se puede ejecutar más de una vez).

alter table public.question_stats
  add column if not exists interval_days integer not null default 0,
  add column if not exists ease real not null default 2.5,
  add column if not exists due_at timestamptz;

create index if not exists question_stats_due_idx
  on public.question_stats (user_id, due_at)
  where due_at is not null;

-- Número de orden dentro de su lote (fuente). Lo rellena scripts/fill-positions.mjs;
-- el simulacro oficial usa este orden y, si falta, cae a created_at/id.
alter table public.questions
  add column if not exists position integer;

create index if not exists questions_source_position_idx
  on public.questions (source, position);

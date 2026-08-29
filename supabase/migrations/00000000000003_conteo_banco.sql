-- ============================================================
-- Conteo agregado del banco por fuente y tema (evita el límite de
-- 1000 filas por consulta: aquí la suma se hace dentro de Postgres,
-- así que solo se devuelven unas pocas filas de resumen, no las
-- miles de preguntas una por una).
-- ============================================================
-- Aplica esto igual que las migraciones anteriores: SQL Editor → pega → Run.

create or replace function public.question_bank_breakdown()
returns table(source text, topic text, cnt bigint)
language sql
stable
as $$
  select q.source, q.topic, count(*) as cnt
  from public.questions q
  group by q.source, q.topic;
$$;

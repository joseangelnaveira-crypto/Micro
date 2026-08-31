-- ============================================================
-- Índices de búsqueda de texto (mejora de rendimiento)
-- ============================================================
-- Aplica esto igual que el esquema inicial: SQL Editor de Supabase → pega → Run.
-- Sin esto, el buscador funciona igual mientras el banco sea pequeño, pero se
-- iría notando más lento al crecer (miles de preguntas más).

create extension if not exists pg_trgm;

create index if not exists questions_question_trgm_idx on public.questions using gin (question gin_trgm_ops);
create index if not exists questions_option_a_trgm_idx on public.questions using gin (option_a gin_trgm_ops);
create index if not exists questions_option_b_trgm_idx on public.questions using gin (option_b gin_trgm_ops);
create index if not exists questions_option_c_trgm_idx on public.questions using gin (option_c gin_trgm_ops);
create index if not exists questions_option_d_trgm_idx on public.questions using gin (option_d gin_trgm_ops);
create index if not exists questions_explanation_trgm_idx on public.questions using gin (explanation gin_trgm_ops);

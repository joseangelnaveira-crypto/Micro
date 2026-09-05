-- Historial de ediciones de una pregunta: cada vez que el admin cambia una pregunta,
-- se guarda una "foto" JSON de cómo estaba ANTES del cambio. Sirve para saber qué se
-- modificó (y cuándo, y por quién) si una corrección resultó equivocada.

create table if not exists public.question_edits (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  edited_by uuid references auth.users(id) on delete set null,
  before_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists question_edits_question_idx
  on public.question_edits(question_id, created_at desc);

alter table public.question_edits enable row level security;

-- Solo el admin ve la auditoría (los usuarios no la necesitan).
drop policy if exists "question_edits_admin_only" on public.question_edits;
create policy "question_edits_admin_only" on public.question_edits
  for all using (public.is_admin()) with check (public.is_admin());

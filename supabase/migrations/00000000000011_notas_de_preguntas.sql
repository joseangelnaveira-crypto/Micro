-- Notas personales por pregunta ("por qué fallé"). Privadas: cada usuario solo ve y edita las suyas.
-- Pegar en el SQL Editor de Supabase. Es idempotente.

create table if not exists public.question_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.question_notes enable row level security;

drop policy if exists "question_notes_own" on public.question_notes;
create policy "question_notes_own" on public.question_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

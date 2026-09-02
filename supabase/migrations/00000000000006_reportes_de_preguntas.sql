-- Permite a cualquier usuario aprobado reportar un posible error en una pregunta
-- (errata, respuesta mal marcada, explicación ambigua...). El admin los revisa desde
-- /admin/questions. No toca el flujo de examen del usuario -- es un canal aparte del
-- "Marcar" (que es solo repaso personal, no llega al admin).

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists question_reports_pending_idx
  on public.question_reports(resolved, created_at desc);

alter table public.question_reports enable row level security;

-- Cualquier usuario aprobado puede crear reportes y ver los suyos propios.
drop policy if exists "question_reports_insert_own" on public.question_reports;
create policy "question_reports_insert_own" on public.question_reports
  for insert with check (user_id = auth.uid() and public.is_approved());

drop policy if exists "question_reports_select_own_or_admin" on public.question_reports;
create policy "question_reports_select_own_or_admin" on public.question_reports
  for select using (user_id = auth.uid() or public.is_admin());

-- Solo el admin los marca como resueltos o los borra.
drop policy if exists "question_reports_admin_update" on public.question_reports;
create policy "question_reports_admin_update" on public.question_reports
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "question_reports_admin_delete" on public.question_reports;
create policy "question_reports_admin_delete" on public.question_reports
  for delete using (public.is_admin());

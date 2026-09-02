-- Suscripciones de notificaciones push (Web Push) por dispositivo, y la marca de
-- cuándo se envió el último recordatorio de inactividad a cada usuario (para no
-- enviar uno nuevo cada día mientras siga inactivo).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.profiles add column if not exists last_reminder_sent_at timestamptz;

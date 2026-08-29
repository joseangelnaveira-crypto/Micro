-- ============================================================
-- Academia de Microbiología — esquema de base de datos (Supabase)
-- ============================================================
-- Cómo aplicarlo: Supabase → tu proyecto → SQL Editor → pega este
-- archivo entero → Run. Es seguro volver a ejecutarlo (usa
-- "if not exists" / "or replace" donde tiene sentido).

-- ------------------------------------------------------------
-- 1. PERFILES (uno por usuario, vinculado a auth.users)
-- ------------------------------------------------------------
-- status: 'pending' (recién registrado, sin acceso) | 'approved' | 'rejected'
-- role:   'user' | 'admin'
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

-- Crea automáticamente un perfil "pending" cada vez que alguien se registra
-- (por Google o por email+contraseña, da igual: ambos crean una fila en auth.users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 2. BANCO DE PREGUNTAS (compartido, solo lo edita un admin)
-- ------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct char(1) not null check (correct in ('A','B','C','D')),
  explanation text not null default '',
  source text not null default 'Sin especificar',
  topic text not null default 'General / otros',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists questions_source_idx on public.questions(source);
create index if not exists questions_topic_idx on public.questions(topic);

-- ------------------------------------------------------------
-- 3. HISTORIAL DE EXÁMENES (privado por usuario)
-- ------------------------------------------------------------
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- IDs de las preguntas usadas, en el orden en que salieron (para poder "repetir examen")
  question_ids uuid[] not null,
  -- Respuestas dadas, en el mismo orden que question_ids: 'A'|'B'|'C'|'D'|null (en blanco)
  answers text[] not null,
  total int not null,
  correct int not null,
  incorrect int not null,
  blank int not null default 0,
  score numeric not null,        -- nota ya con la fórmula de corrección aplicada
  pass_mark int not null default 50,
  duration_ms bigint not null default 0,
  flagged_ids uuid[] not null default '{}',
  source_filter text,
  topic_filter text,
  -- Para sincronización offline: id generado en el propio dispositivo,
  -- así dos exámenes hechos sin conexión en dispositivos distintos nunca chocan.
  client_uuid uuid not null unique,
  created_at timestamptz not null default now()
);

create index if not exists exam_attempts_user_idx on public.exam_attempts(user_id, created_at desc);

-- ------------------------------------------------------------
-- 4. ESTADÍSTICAS POR PREGUNTA (privado por usuario, para el repaso inteligente)
-- ------------------------------------------------------------
create table if not exists public.question_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  seen int not null default 0,
  correct int not null default 0,
  last_seen_at timestamptz,
  primary key (user_id, question_id)
);

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY — esto es lo que hace que sea seguro
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.question_stats enable row level security;

-- Función auxiliar: ¿el usuario autenticado actual es admin?
create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

-- Función auxiliar: ¿el usuario autenticado actual está aprobado?
create or replace function public.is_approved()
returns boolean
language sql security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- PROFILES: cada uno ve y edita el suyo; el admin los ve y edita todos.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_admin());

-- QUESTIONS: cualquier usuario aprobado puede leer; solo el admin escribe.
drop policy if exists "questions_select_approved" on public.questions;
create policy "questions_select_approved" on public.questions
  for select using (public.is_approved() or public.is_admin());

drop policy if exists "questions_write_admin_only" on public.questions;
create policy "questions_write_admin_only" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- EXAM_ATTEMPTS: cada usuario ve y crea solo los suyos; el admin ve todos (solo lectura).
drop policy if exists "exam_attempts_own" on public.exam_attempts;
create policy "exam_attempts_own" on public.exam_attempts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "exam_attempts_admin_read" on public.exam_attempts;
create policy "exam_attempts_admin_read" on public.exam_attempts
  for select using (public.is_admin());

-- QUESTION_STATS: igual que exam_attempts.
drop policy if exists "question_stats_own" on public.question_stats;
create policy "question_stats_own" on public.question_stats
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "question_stats_admin_read" on public.question_stats;
create policy "question_stats_admin_read" on public.question_stats
  for select using (public.is_admin());

-- ------------------------------------------------------------
-- 6. Primer administrador
-- ------------------------------------------------------------
-- Después de registrarte tú mismo por primera vez en la app (con tu email
-- o con Google), ejecuta esto UNA VEZ cambiando el email por el tuyo:
--
-- update public.profiles
--   set role = 'admin', status = 'approved', approved_at = now()
--   where email = 'tu-email@ejemplo.com';

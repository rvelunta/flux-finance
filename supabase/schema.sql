-- FLUX — Supabase schema
-- Run this once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Idempotent: safe to re-run; uses IF NOT EXISTS / OR REPLACE throughout.

-- One row per user. `data` holds the same shape as the localStorage blob
-- ({scenarios, activeScenarioId, compareIds, customFlowCats, flowCatDisplay, config}).
create table if not exists public.user_data (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-Level Security: every user only sees / mutates their own row.
alter table public.user_data enable row level security;

drop policy if exists user_data_select_own on public.user_data;
create policy user_data_select_own on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists user_data_insert_own on public.user_data;
create policy user_data_insert_own on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists user_data_update_own on public.user_data;
create policy user_data_update_own on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_data_delete_own on public.user_data;
create policy user_data_delete_own on public.user_data
  for delete using (auth.uid() = user_id);

-- Keep updated_at honest server-side so the client can use it for
-- conflict resolution (newer wins) without trusting the browser clock.
create or replace function public.user_data_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_touch_updated_at on public.user_data;
create trigger user_data_touch_updated_at
  before update on public.user_data
  for each row execute function public.user_data_touch_updated_at();

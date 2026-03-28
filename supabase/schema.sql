create table if not exists public.ledger_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{"accounts":[],"categories":[],"transactions":[]}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ledger_state enable row level security;

create or replace function public.set_ledger_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists ledger_state_set_updated_at on public.ledger_state;

create trigger ledger_state_set_updated_at
before update on public.ledger_state
for each row
execute function public.set_ledger_state_updated_at();

drop policy if exists "ledger_state_select_own" on public.ledger_state;
create policy "ledger_state_select_own"
on public.ledger_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "ledger_state_insert_own" on public.ledger_state;
create policy "ledger_state_insert_own"
on public.ledger_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "ledger_state_update_own" on public.ledger_state;
create policy "ledger_state_update_own"
on public.ledger_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "ledger_state_delete_own" on public.ledger_state;
create policy "ledger_state_delete_own"
on public.ledger_state
for delete
to authenticated
using (auth.uid() = user_id);

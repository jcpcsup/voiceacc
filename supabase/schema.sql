create extension if not exists "pgcrypto";

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  sort_order integer not null default 0,
  type text not null,
  currency_symbol text not null default '$',
  opening_balance numeric(14, 2) not null default 0,
  include_in_total_balance boolean not null default true,
  color text not null default '#19c6a7',
  icon text not null default 'wallet',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  icon text not null default 'cart',
  color text not null default '#19c6a7',
  subcategories text[] not null default '{}',
  budget_limit numeric(14, 2) not null default 0,
  budget_period text not null default 'monthly' check (budget_period in ('weekly', 'monthly')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.counterparties (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  icon text not null default 'briefcase',
  color text not null default '#6657ca',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.lookup_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('counterparty', 'project', 'tag')),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create table if not exists public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric(14, 2) not null default 0,
  transaction_date date not null default current_date,
  account_id text null,
  from_account_id text null,
  to_account_id text null,
  category_id text null,
  subcategory text not null default '',
  counterparty text not null default '',
  counterparty_id text not null default '',
  counterparty_effect text not null default '',
  project text not null default '',
  tags text[] not null default '{}',
  details text not null default '',
  slip_path text not null default '',
  slip_resolution integer not null default 720,
  slip_mime_type text not null default '',
  slip_updated_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists counterparties_user_id_idx on public.counterparties (user_id);
create index if not exists lookup_entries_user_id_idx on public.lookup_entries (user_id);
create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_user_id_date_idx on public.transactions (user_id, transaction_date desc);

alter table public.transactions
add column if not exists slip_path text not null default '';

alter table public.transactions
add column if not exists slip_resolution integer not null default 720;

alter table public.transactions
add column if not exists slip_mime_type text not null default '';

alter table public.transactions
add column if not exists slip_updated_at timestamptz null;

alter table public.transactions
add column if not exists counterparty_id text not null default '';

alter table public.transactions
add column if not exists counterparty_effect text not null default '';

alter table public.accounts
add column if not exists include_in_total_balance boolean not null default true;

alter table public.accounts
add column if not exists sort_order integer not null default 0;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at
before update on public.accounts
for each row
execute function public.set_row_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row
execute function public.set_row_updated_at();

drop trigger if exists counterparties_set_updated_at on public.counterparties;
create trigger counterparties_set_updated_at
before update on public.counterparties
for each row
execute function public.set_row_updated_at();

drop trigger if exists lookup_entries_set_updated_at on public.lookup_entries;
create trigger lookup_entries_set_updated_at
before update on public.lookup_entries
for each row
execute function public.set_row_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row
execute function public.set_row_updated_at();

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.counterparties enable row level security;
alter table public.lookup_entries enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
create policy "accounts_select_own"
on public.accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "accounts_insert_own" on public.accounts;
create policy "accounts_insert_own"
on public.accounts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "accounts_update_own" on public.accounts;
create policy "accounts_update_own"
on public.accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_delete_own"
on public.accounts
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own"
on public.categories
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own"
on public.categories
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own"
on public.categories
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own"
on public.categories
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "counterparties_select_own" on public.counterparties;
create policy "counterparties_select_own"
on public.counterparties
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "counterparties_insert_own" on public.counterparties;
create policy "counterparties_insert_own"
on public.counterparties
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "counterparties_update_own" on public.counterparties;
create policy "counterparties_update_own"
on public.counterparties
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "counterparties_delete_own" on public.counterparties;
create policy "counterparties_delete_own"
on public.counterparties
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "lookup_entries_select_own" on public.lookup_entries;
create policy "lookup_entries_select_own"
on public.lookup_entries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "lookup_entries_insert_own" on public.lookup_entries;
create policy "lookup_entries_insert_own"
on public.lookup_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "lookup_entries_update_own" on public.lookup_entries;
create policy "lookup_entries_update_own"
on public.lookup_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "lookup_entries_delete_own" on public.lookup_entries;
create policy "lookup_entries_delete_own"
on public.lookup_entries
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transaction-slips',
  'transaction-slips',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "transaction_slips_select_own" on storage.objects;
create policy "transaction_slips_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'transaction-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_slips_insert_own" on storage.objects;
create policy "transaction_slips_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'transaction-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_slips_update_own" on storage.objects;
create policy "transaction_slips_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'transaction-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'transaction-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "transaction_slips_delete_own" on storage.objects;
create policy "transaction_slips_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'transaction-slips'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Legacy snapshot table kept only as a migration source for existing installs.
create table if not exists public.ledger_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{"accounts":[],"categories":[],"transactions":[]}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ledger_state enable row level security;

drop trigger if exists ledger_state_set_updated_at on public.ledger_state;
create trigger ledger_state_set_updated_at
before update on public.ledger_state
for each row
execute function public.set_row_updated_at();

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

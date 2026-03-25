create table if not exists public.transactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  type text not null check (type in ('expense', 'income', 'transfer')),
  amount numeric(12, 2) not null check (amount > 0),
  date date not null,
  account_id text not null default '',
  account_name text not null default '',
  from_account_id text not null default '',
  from_account_name text not null default '',
  to_account_id text not null default '',
  to_account_name text not null default '',
  category_id text not null default '',
  category_name text not null default '',
  subcategory text not null default '',
  counterparty text not null default '',
  project text not null default '',
  tags jsonb not null default '[]'::jsonb,
  details text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

alter table public.transactions enable row level security;

create policy "Users can read their own transactions"
on public.transactions
for select
using (auth.uid() = user_id);

create policy "Users can insert their own transactions"
on public.transactions
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own transactions"
on public.transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own transactions"
on public.transactions
for delete
using (auth.uid() = user_id);

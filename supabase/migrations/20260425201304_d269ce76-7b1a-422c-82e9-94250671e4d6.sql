-- 1) Plateforme sur subscriptions
alter table public.subscriptions
  add column if not exists platform text;

-- Validation: platform doit être 'mac' ou 'windows' (ou null pour anciens enregistrements)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_platform_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_platform_check
      check (platform is null or platform in ('mac','windows'));
  end if;
end $$;

-- 2) Élargir plan pour accepter 'yearly' (on garde 'lifetime' en lecture pour anciens)
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'subscriptions_plan_check'
  ) then
    alter table public.subscriptions drop constraint subscriptions_plan_check;
  end if;
  alter table public.subscriptions
    add constraint subscriptions_plan_check
    check (plan in ('monthly','yearly','lifetime'));
end $$;

-- 3) Table licenses
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  license_key text not null unique,
  plan text not null check (plan in ('monthly','yearly')),
  platform text not null check (platform in ('mac','windows')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  max_activations int not null default 3,
  activations int not null default 0,
  environment text not null default 'sandbox' check (environment in ('sandbox','live')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_licenses_user on public.licenses(user_id);
create index if not exists idx_licenses_subscription on public.licenses(subscription_id);
create index if not exists idx_licenses_key on public.licenses(license_key);

alter table public.licenses enable row level security;

drop policy if exists "Users can view own licenses" on public.licenses;
create policy "Users can view own licenses"
  on public.licenses for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all licenses" on public.licenses;
create policy "Admins can view all licenses"
  on public.licenses for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop trigger if exists trg_licenses_updated_at on public.licenses;
create trigger trg_licenses_updated_at
  before update on public.licenses
  for each row execute function public.set_updated_at();

-- 4) Table webhook_events (idempotence)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  event_id text not null,
  event_type text not null,
  environment text not null check (environment in ('sandbox','live')),
  payload jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, event_id, environment)
);

create index if not exists idx_webhook_events_event on public.webhook_events(provider, event_id, environment);

alter table public.webhook_events enable row level security;

drop policy if exists "Admins can view webhook events" on public.webhook_events;
create policy "Admins can view webhook events"
  on public.webhook_events for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) Mise à jour de has_active_access pour inclure 'yearly'
create or replace function public.has_active_access(_user_id uuid, _env text default 'sandbox')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'admin'::app_role)
    or exists (
      select 1 from public.subscriptions
      where user_id = _user_id
        and environment = _env
        and (
          (plan = 'lifetime' and status in ('active', 'paid'))
          or (
            plan in ('monthly','yearly')
            and (
              (status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
              or (status = 'canceled' and current_period_end > now())
            )
          )
        )
    );
$$;

-- 6) Realtime sur licenses + subscriptions
alter table public.subscriptions replica identity full;
alter table public.licenses replica identity full;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.subscriptions';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.licenses';
  exception when duplicate_object then null;
  end;
end $$;
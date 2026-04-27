-- Subscriptions table (one row per Stripe subscription or lifetime purchase)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'lifetime')),
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  price_id text,
  product_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscriptions_stripe_subscription_id_key
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_user_env on public.subscriptions(user_id, environment);

alter table public.subscriptions enable row level security;

-- Users can view their own subscriptions
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- Admins can view all subscriptions
create policy "Admins can view all subscriptions"
  on public.subscriptions for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- No client write/update/delete policies — only the service role (edge functions) writes here.

-- Trigger to keep updated_at fresh
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Helper function: does this user currently have access?
-- Returns true if admin, OR active lifetime, OR active monthly subscription.
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
            plan = 'monthly'
            and (
              (status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
              or (status = 'canceled' and current_period_end > now())
            )
          )
        )
    );
$$;
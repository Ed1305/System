-- =====================================================================
--  System dashboard — Neon Postgres schema
--
--  HOW TO APPLY:
--    1. Create a Neon project (free tier is fine) and open it.
--    2. Go to SQL Editor -> paste this whole file -> Run.
--    3. In Vercel: project settings -> Environment Variables ->
--       add DATABASE_URL = <Neon pooled connection string>
--       (the connection string from the Neon dashboard "Connection
--       string" section that ends with ?pooler=true).
--    4. Redeploy (Vercel auto-deploys when this branch is pushed).
--
--  This file is safe to run more than once.
-- =====================================================================

-- ---------- apps (the app tiles shown on the Start Menu hub) ----------
create table if not exists public.apps (
    id        bigserial primary key,
    name      text not null,
    url       text,
    platform  text,
    "addedAt" timestamptz not null default now()   -- quoted camelCase:
                                                 -- matches the frontend's
                                                 -- .order('addedAt')
                                                 -- and insert payload
);

-- ---------- activities (user/admin activity log) ----------
create table if not exists public.activities (
    id         bigserial primary key,
    action     text not null,
    details    text,
    timestamp  timestamptz not null default now()
);

-- ---------- settings (single row, id = 1, stores the Render API key) ----------
create table if not exists public.settings (
    id              integer primary key default 1,
    render_api_key  text,
    updated_at      timestamptz
);

-- Seed the row the admin panel expects
insert into public.settings (id)
values (1)
on conflict (id) do nothing;

-- ---------- Row Level Security ----------
-- The Vercel API layer is the only client that touches these tables, so
-- policies are intentionally permissive (true = allow all for the role
-- the API connects with). Tighten them later if you add auth.
alter table public.apps       enable row level security;
alter table public.activities enable row level security;
alter table public.settings   enable row level security;

drop policy if exists "apps_all" on public.apps;
create policy "apps_all" on public.apps
    for all using (true) with check (true);

drop policy if exists "activities_all" on public.activities;
create policy "activities_all" on public.activities
    for all using (true) with check (true);

drop policy if exists "settings_all" on public.settings;
create policy "settings_all" on public.settings
    for all using (true) with check (true);

-- =====================================================================
--  System dashboard — Neon Postgres schema
--
--  HOW TO APPLY:
--    1. Create a Neon project (free tier is fine) and open it.
--    2. Go to SQL Editor -> paste this whole file -> Run.
--    3. In Vercel: project settings -> Environment Variables -> add
--         DATABASE_URL   = <Neon pooled connection string>
--         ADMIN_PASSWORD = <a new admin password>
--         SESSION_SECRET = <a long random string>   (recommended)
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

-- Existing databases: add the icon column if it's missing
alter table public.apps add column if not exists icon text;

-- ---------- activities (user/admin activity log) ----------
create table if not exists public.activities (
    id         bigserial primary key,
    action     text not null,
    details    text,
    timestamp  timestamptz not null default now()
);

-- The old `settings` table (Render API key) is no longer used. Once this
-- version is deployed you can remove it, which also deletes the stored key:
--   drop table if exists public.settings;

-- ---------- Row Level Security ----------
-- The Vercel API layer is the only client that touches these tables and
-- it does the access checks itself (admin cookie), so these policies are
-- permissive for the role the API connects with. Never expose
-- DATABASE_URL to the browser.
alter table public.apps       enable row level security;
alter table public.activities enable row level security;

drop policy if exists "apps_all" on public.apps;
create policy "apps_all" on public.apps
    for all using (true) with check (true);

drop policy if exists "activities_all" on public.activities;
create policy "activities_all" on public.activities
    for all using (true) with check (true);

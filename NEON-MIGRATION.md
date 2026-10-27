# Neon migration — setup guide

The dashboard no longer uses Supabase. It now talks to a small set of
Vercel API endpoints (`api/*.js`) backed by a Neon Postgres database.

## 1. Create a Neon project

- Sign up at [neon.tech](https://neon.tech) and create a project
  (free tier is fine).
- Open the project → you'll see the SQL editor and connection strings.

## 2. Create the tables

- In the Neon dashboard: **SQL Editor** → paste the contents of
  [`schema.sql`](./schema.sql) → **Run**.
- This creates `apps`, `activities`, `settings` and seeds the settings row.
- If your database already exists, run `schema.sql` again — it is
  idempotent and will add the new `icon` column used by the app icon
  picker.

## 3. Get the connection string

- In the Neon dashboard: **Connection string** section.
- Use the **Pooled** connection string (it ends with `?pooler=true`).
- Keep it private — it is your database password.

## 4. Add DATABASE_URL to Vercel

- Vercel dashboard → project **system.** → **Settings → Environment
  Variables** → add:
  - Name: `DATABASE_URL`
  - Value: `<your Neon pooled connection string>`
  - Apply to **Production** and **Preview**.
- If you want the Render "add app" flow to use a server-side key, also add
  `RENDER_API_KEY`. (Otherwise the Render flow uses the key entered in the
  admin panel — the API route now accepts it from the request body.)

## 5. Deploy

- Push this branch (or merge it to `main`). Vercel auto-deploys.
- The new deployment needs the environment variable from step 4, so
  deploy/promote **after** adding it.

## 6. Verify

- Open the deployment and log in.
- You should see **"No apps yet. Admin can add them."** — that means the
  API and database are connected. (The old "Could not load apps" error
  means the API can't reach the database: check the `DATABASE_URL`
  variable and the Vercel function logs.)
- Open the lock icon, enter the admin password (`ak2026!`), and add apps.

## Notes

- **Live updates:** the tiles refresh automatically every 15 seconds
  (polling). This replaces Supabase realtime.
- **Security:** the Supabase anon key used to be visible in the page;
  Neon credentials now live only in Vercel's server-side environment.
- **Supabase cleanup:** the old project is empty and paused — you can
  delete it from the Supabase dashboard.

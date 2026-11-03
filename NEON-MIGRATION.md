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

## 4. Add environment variables to Vercel

Vercel dashboard → project **system.** → **Settings → Environment
Variables** → add these, applied to **Production** and **Preview**:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Neon pooled connection string |
| `ADMIN_PASSWORD` | the admin password (pick a **new** one — the old one was published in this repo's history) |
| `SESSION_SECRET` | a long random string, e.g. the output of `openssl rand -base64 32` (recommended; signs the admin cookie) |

The admin password is checked only on the server. Changing
`ADMIN_PASSWORD` or `SESSION_SECRET` signs every admin out.

## 5. Deploy

- Push this branch (or merge it to `main`). Vercel auto-deploys.
- The new deployment needs the environment variables from step 4, so
  deploy/promote **after** adding them.

## 6. Verify

- Open the deployment and log in.
- You should see **"No apps yet. Admin can add them."** — that means the
  API and database are connected. (The old "Could not load apps" error
  means the API can't reach the database: check the `DATABASE_URL`
  variable and the Vercel function logs.)
- Open the cog icon, enter your `ADMIN_PASSWORD`, and add apps.
- `/api/health` returns `{"ok": true}` when the database is reachable and
  `ADMIN_PASSWORD` is set. Signed in as admin, it also shows the table
  details.

## Notes

- **Live updates:** the tiles refresh automatically every 15 seconds
  (polling). This replaces Supabase realtime.
- **Security:** Neon credentials and the admin password live only in
  Vercel's server-side environment. Adding, editing and removing apps,
  reading the activity log and fetching app names all require the admin
  cookie; the API rejects them otherwise.
- **Render:** the Render integration has been removed. You can delete the
  old `settings` table (it held the Render key):
  `drop table if exists public.settings;`
  and remove `RENDER_API_KEY` from Vercel if you set it.

## Tests

```bash
npm install
npm test            # API tests (no database or network needed)
npm run test:ui     # browser test (needs Playwright + Chromium)
```
- **Supabase cleanup:** the old project is empty and paused — you can
  delete it from the Supabase dashboard.

// api/health.js
// Diagnostics endpoint. Open /api/health in the browser (while logged
// in to Vercel) and you get a JSON report on whether the Neon database
// is reachable from this deployment, plus what the apps table looks like.
import sql from './lib/db.js';

export default async function handler(req, res) {
    const report = { ok: false };
    try {
        report.database_url_set = !!process.env.DATABASE_URL;

        const ping = await sql()`select 1 as ok`;
        report.db_ping = ping[0] ? ping[0].ok : null;

        const cols = await sql()`
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'apps'
            order by ordinal_position
        `;
        report.apps_columns = cols.map(c => c.column_name);

        const count = await sql()`select count(*)::int as n from public.apps`;
        report.apps_count = count[0] ? count[0].n : 0;

        report.ok = true;
    } catch (err) {
        report.error = err.message;
    }
    return res.status(200).json(report);
}

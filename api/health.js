// api/health.js
// Diagnostics. Anyone gets { ok }; a signed-in admin also gets details
// about the database (columns, row count, error message).
import sql from './lib/db.js';
import { route } from './lib/http.js';
import { isAdmin } from './lib/auth.js';

export default route({
    async GET(req, res) {
        const report = { ok: false };
        try {
            report.database_url_set = !!process.env.DATABASE_URL;
            report.admin_password_set = !!process.env.ADMIN_PASSWORD;

            const ping = await sql()`select 1 as ok`;
            report.db_ping = ping[0] ? ping[0].ok : null;

            const cols = await sql()`
                select column_name
                from information_schema.columns
                where table_schema = 'public' and table_name = 'apps'
                order by ordinal_position`;
            report.apps_columns = cols.map(c => c.column_name);

            const count = await sql()`select count(*)::int as n from public.apps`;
            report.apps_count = count[0] ? count[0].n : 0;

            report.ok = report.admin_password_set;
        } catch (err) {
            report.error = err.message;
        }
        if (!isAdmin(req)) {
            return res.status(report.ok ? 200 : 503).json({ ok: report.ok });
        }
        return res.status(200).json(report);
    }
});

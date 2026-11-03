// api/apps.js
// App tiles.
//   GET          -> list (public: everyone signed in by name sees the tiles)
//   POST (admin) -> { name, url, platform?, icon? }
import sql, { hasIconColumn } from './lib/db.js';
import { route } from './lib/http.js';
import { requireAdmin } from './lib/auth.js';
import { logActivity } from './lib/activity.js';
import { text, httpUrl } from './lib/validate.js';

export default route({
    async GET(req, res) {
        // Older databases may not have the icon column yet
        const apps = (await hasIconColumn())
            ? await sql()`
                select id, name, url, platform, "addedAt", icon
                from public.apps
                order by "addedAt" desc`
            : await sql()`
                select id, name, url, platform, "addedAt", null as icon
                from public.apps
                order by "addedAt" desc`;
        return res.status(200).json(apps);
    },

    async POST(req, res) {
        requireAdmin(req);
        const body = req.body || {};
        const name = text(body.name, 'name', { max: 100, required: true });
        const url = httpUrl(body.url);
        const platform = text(body.platform, 'platform', { max: 30 });
        const icon = text(body.icon, 'icon', { max: 30 });

        const inserted = (await hasIconColumn())
            ? await sql()`
                insert into public.apps (name, url, platform, icon)
                values (${name}, ${url}, ${platform}, ${icon})
                returning id, name, url, platform, "addedAt", icon`
            : await sql()`
                insert into public.apps (name, url, platform)
                values (${name}, ${url}, ${platform})
                returning id, name, url, platform, "addedAt"`;

        await logActivity('App added', `"${name}" (${platform || 'web'}) — ${url}`);
        return res.status(201).json(inserted[0]);
    }
});

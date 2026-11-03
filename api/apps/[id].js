// api/apps/[id].js
// Update and delete a single app (admin "Your apps" editor).
import sql, { hasIconColumn } from '../lib/db.js';
import { route, HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { logActivity } from '../lib/activity.js';
import { text, httpUrl, id as parseId } from '../lib/validate.js';

async function update(req, res) {
    requireAdmin(req);
    // Vercel puts dynamic route segments ([id]) on req.query, not req.params
    const id = parseId(req.query.id);
    const body = req.body || {};
    const name = text(body.name, 'name', { max: 100, required: true });
    const url = httpUrl(body.url);
    const iconGiven = Object.prototype.hasOwnProperty.call(body, 'icon');
    const icon = text(body.icon, 'icon', { max: 30 });

    const updated = (iconGiven && await hasIconColumn())
        ? await sql()`
            update public.apps
            set name = ${name}, url = ${url}, icon = ${icon}
            where id = ${id}
            returning id, name, url, platform, "addedAt", icon`
        : await sql()`
            update public.apps
            set name = ${name}, url = ${url}
            where id = ${id}
            returning id, name, url, platform, "addedAt"`;
    if (updated.length === 0) throw new HttpError(404, 'App not found');

    await logActivity('App updated', `"${name}" — ${url}`);
    return res.status(200).json(updated[0]);
}

export default route({
    PATCH: update,
    PUT: update,

    async DELETE(req, res) {
        requireAdmin(req);
        const id = parseId(req.query.id);
        const deleted = await sql()`
            delete from public.apps
            where id = ${id}
            returning id, name`;
        if (deleted.length === 0) throw new HttpError(404, 'App not found');

        await logActivity('App removed', `"${deleted[0].name}"`);
        return res.status(200).json({ success: true });
    }
});

// api/apps/[id].js
// Update and delete a single app (used by the admin "Your apps" editor).
import sql from '../lib/db.js';

export default async function handler(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid id' });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
        const { name, url, icon } = req.body || {};
        if (!name || !url) {
            return res.status(400).json({ error: 'name and url are required' });
        }
        const updated = await sql()`
            update public.apps
            set name = ${name},
                url = ${url},
                icon = ${icon ?? null}
            where id = ${id}
            returning id, name, url, platform, "addedAt", icon
        `;
        if (updated.length === 0) {
            return res.status(404).json({ error: 'App not found' });
        }
        return res.status(200).json(updated[0]);
    }

    if (req.method === 'DELETE') {
        const deleted = await sql()`
            delete from public.apps
            where id = ${id}
            returning id
        `;
        if (deleted.length === 0) {
            return res.status(404).json({ error: 'App not found' });
        }
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

// api/settings.js
// Single settings row (id = 1) that stores the Render API key.
import sql from './lib/db.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const rows = await sql()`
            select id, render_api_key, updated_at
            from public.settings
            where id = 1
        `;
        return res.status(200).json(rows[0] || null);
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
        const { render_api_key } = req.body || {};
        const rows = await sql()`
            update public.settings
            set render_api_key = ${render_api_key ?? null},
                updated_at = now()
            where id = 1
            returning id, render_api_key, updated_at
        `;
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Settings row not found' });
        }
        return res.status(200).json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

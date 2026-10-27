// api/apps.js
// App tiles: list + create.
import sql, { hasIconColumn } from './lib/db.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // Older databases may not have the icon column yet — fall back
        // to a null so the list still works.
        const iconCol = await hasIconColumn() ? ', icon' : ', null as icon';
        const apps = await sql()(`
            select id, name, url, platform, "addedAt"${iconCol}
            from public.apps
            order by "addedAt" desc
        `);
        return res.status(200).json(apps);
    }

    if (req.method === 'POST') {
        const { name, url, platform, icon } = req.body || {};
        if (!name || !url) {
            return res.status(400).json({ error: 'name and url are required' });
        }
        let inserted;
        if (await hasIconColumn()) {
            inserted = await sql()`
                insert into public.apps (name, url, platform, icon)
                values (${name}, ${url}, ${platform || null}, ${icon || null})
                returning id, name, url, platform, "addedAt", icon
            `;
        } else {
            inserted = await sql()`
                insert into public.apps (name, url, platform)
                values (${name}, ${url}, ${platform || null})
                returning id, name, url, platform, "addedAt"
            `;
        }
        return res.status(201).json(inserted[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

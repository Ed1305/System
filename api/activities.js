// api/activities.js
// Activity log: list + create.
import sql from './lib/db.js';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        const activities = await sql()`
            select id, action, details, timestamp
            from public.activities
            order by timestamp desc
            limit 200
        `;
        return res.status(200).json(activities);
    }

    if (req.method === 'POST') {
        const { action, details } = req.body || {};
        if (!action) {
            return res.status(400).json({ error: 'action is required' });
        }
        const inserted = await sql()`
            insert into public.activities (action, details)
            values (${action}, ${details || null})
            returning id, action, details, timestamp
        `;
        return res.status(201).json(inserted[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

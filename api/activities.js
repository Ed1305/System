// api/activities.js
// Activity log.
//   GET  (admin)  -> latest 200 entries
//   POST (anyone) -> only "User login" / "User logout"; every admin action
//                    is logged by the server itself, so it can't be forged.
import sql from './lib/db.js';
import { route, HttpError } from './lib/http.js';
import { requireAdmin } from './lib/auth.js';
import { text } from './lib/validate.js';
import { logActivity } from './lib/activity.js';

const PUBLIC_ACTIONS = new Set(['User login', 'User logout']);

export default route({
    async GET(req, res) {
        requireAdmin(req);
        const activities = await sql()`
            select id, action, details, timestamp
            from public.activities
            order by timestamp desc
            limit 200
        `;
        return res.status(200).json(activities);
    },

    async POST(req, res) {
        const body = req.body || {};
        const action = text(body.action, 'action', { max: 50, required: true });
        if (!PUBLIC_ACTIONS.has(action)) {
            throw new HttpError(400, 'Unknown activity');
        }
        const user = text(body.user, 'user', { max: 80, required: true });
        const verb = action === 'User login' ? 'logged in' : 'logged out';
        await logActivity(action, `User "${user}" ${verb}`);
        return res.status(201).json({ ok: true });
    }
});

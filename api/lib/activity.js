// api/lib/activity.js
// Server-side activity logging (admin actions are recorded here, not by
// the browser, so the log can't be forged from the page).
import sql from './db.js';

export async function logActivity(action, details) {
    await sql()`
        insert into public.activities (action, details)
        values (${action}, ${details || null})
    `;
}

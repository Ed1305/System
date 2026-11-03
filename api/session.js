// api/session.js
// Admin session.
//   GET    -> { admin: true|false }  (is this browser signed in as admin?)
//   POST   -> { password }           sign in, sets the HttpOnly cookie
//   DELETE ->                        sign out
import { route, HttpError } from './lib/http.js';
import { checkPassword, isAdmin, setAdminCookie, clearAdminCookie } from './lib/auth.js';
import { logActivity } from './lib/activity.js';

export default route({
    async GET(req, res) {
        return res.status(200).json({ admin: isAdmin(req) });
    },

    async POST(req, res) {
        const { password } = req.body || {};
        if (!checkPassword(password)) {
            // Slow down guessing a little
            await new Promise(r => setTimeout(r, 750));
            await logActivity('Admin login failed', 'Wrong password').catch(() => {});
            throw new HttpError(401, 'Incorrect password');
        }
        setAdminCookie(res);
        await logActivity('Admin login', 'Successful login').catch(() => {});
        return res.status(200).json({ admin: true });
    },

    async DELETE(req, res) {
        if (isAdmin(req)) {
            await logActivity('Admin logout', 'Logged out').catch(() => {});
        }
        clearAdminCookie(res);
        return res.status(200).json({ admin: false });
    }
});

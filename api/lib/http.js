// api/lib/http.js
// Small wrapper every API route goes through:
//   - dispatches by HTTP method (405 for anything not handled)
//   - turns thrown errors into a JSON response instead of a crashed function
//   - requires a JSON body on state-changing requests. Browsers can't send
//     `Content-Type: application/json` cross-site without a CORS preflight
//     (which we never approve), so this blocks CSRF from other origins.

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function route(handlers) {
    return async function handler(req, res) {
        const fn = handlers[req.method];
        if (!fn) {
            res.setHeader('Allow', Object.keys(handlers).join(', '));
            return res.status(405).json({ error: 'Method not allowed' });
        }
        res.setHeader('Cache-Control', 'no-store');
        try {
            if (WRITE_METHODS.has(req.method) && req.method !== 'DELETE') {
                const type = String(req.headers['content-type'] || '');
                if (!type.toLowerCase().startsWith('application/json')) {
                    throw new HttpError(415, 'Expected a JSON request body');
                }
            }
            return await fn(req, res);
        } catch (err) {
            if (err instanceof HttpError) {
                return res.status(err.status).json({ error: err.message });
            }
            console.error(`${req.method} ${req.url} failed:`, err);
            return res.status(500).json({ error: 'Server error — check the Vercel function logs' });
        }
    };
}

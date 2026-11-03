// api/lib/validate.js
// Input checks shared by the API routes.
import { HttpError } from './http.js';

export function text(value, field, { max = 200, required = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw new HttpError(400, `${field} is required`);
        return null;
    }
    if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
    const trimmed = value.trim();
    if (required && !trimmed) throw new HttpError(400, `${field} is required`);
    if (trimmed.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`);
    return trimmed || null;
}

// Only absolute http(s) URLs — blocks javascript:, data:, etc. from ever
// being stored as a tile link.
export function httpUrl(value, field = 'url') {
    const raw = text(value, field, { max: 2048, required: true });
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new HttpError(400, `${field} must be a full URL, e.g. https://my-app.vercel.app`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new HttpError(400, `${field} must start with http:// or https://`);
    }
    return parsed.toString();
}

export function id(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
    return n;
}

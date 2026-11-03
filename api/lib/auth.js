// api/lib/auth.js
// Admin session: a signed, HttpOnly cookie set after the admin password is
// checked on the server. The password itself lives only in the
// ADMIN_PASSWORD environment variable on Vercel.
//
// Cookie value: "<expiresAtMs>.<hmac-sha256(expiresAtMs)>", signed with
// SESSION_SECRET (falls back to ADMIN_PASSWORD, so changing the password
// also signs everyone out).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE = 'ak_admin';
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours

function secret() {
    const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
    if (!s) throw new HttpError(500, 'ADMIN_PASSWORD is not set on this Vercel project');
    return s;
}

function sign(value) {
    return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    // Compare equal-length buffers so timing doesn't leak the length
    if (ab.length !== bb.length) {
        timingSafeEqual(ab, ab);
        return false;
    }
    return timingSafeEqual(ab, bb);
}

export function checkPassword(candidate) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) throw new HttpError(500, 'ADMIN_PASSWORD is not set on this Vercel project');
    return typeof candidate === 'string' && safeEqual(candidate, expected);
}

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > -1 && part.slice(0, i).trim() === name) {
            return decodeURIComponent(part.slice(i + 1).trim());
        }
    }
    return null;
}

function cookieAttrs(maxAgeSeconds) {
    return `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function setAdminCookie(res) {
    const expires = String(Date.now() + SESSION_MS);
    res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${sign(expires)}; ${cookieAttrs(SESSION_MS / 1000)}`);
}

export function clearAdminCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
}

export function isAdmin(req) {
    if (!process.env.SESSION_SECRET && !process.env.ADMIN_PASSWORD) return false;
    const value = readCookie(req, COOKIE);
    if (!value) return false;
    const dot = value.indexOf('.');
    if (dot < 1) return false;
    const expires = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
    return safeEqual(sig, sign(expires));
}

export function requireAdmin(req) {
    if (!isAdmin(req)) throw new HttpError(401, 'Admin login required');
}

// API route tests — run with `npm test`. Uses a fake database, no network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSqlClient } from '../api/lib/db.js';
import { isPrivateAddress } from '../api/lib/safe-fetch.js';
import sessionHandler from '../api/session.js';
import appsHandler from '../api/apps.js';
import appByIdHandler from '../api/apps/[id].js';
import activitiesHandler from '../api/activities.js';
import fetchNameHandler, { extractTitle } from '../api/fetch-app-name.js';
import healthHandler from '../api/health.js';

process.env.ADMIN_PASSWORD = 'correct horse';
process.env.SESSION_SECRET = 'test-secret';

// ---- fake Neon client: records queries, answers from a queue ----
let queries, answers;
function fakeSql(strings, ...values) {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    queries.push({ text, values });
    if (/information_schema/.test(text) && /count\(\*\)/.test(text)) return Promise.resolve([{ n: 1 }]);
    return Promise.resolve(answers.length ? answers.shift() : []);
}
beforeEach(() => {
    queries = [];
    answers = [];
    setSqlClient(fakeSql);
});

// ---- minimal Vercel req/res stand-ins ----
function call(handler, { method = 'GET', body, query = {}, cookie, json = true } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined && json) headers['content-type'] = 'application/json';
    const req = { method, body, query, headers, url: '/test' };
    return new Promise((resolve) => {
        const res = {
            statusCode: 200, headers: {},
            setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { resolve({ status: this.statusCode, data, headers: this.headers }); return this; }
        };
        handler(req, res);
    });
}

async function adminCookie() {
    const r = await call(sessionHandler, { method: 'POST', body: { password: 'correct horse' } });
    assert.equal(r.status, 200);
    return r.headers['set-cookie'].split(';')[0];
}

// ---------------- session ----------------
test('wrong admin password is rejected and sets no cookie', async () => {
    const r = await call(sessionHandler, { method: 'POST', body: { password: 'ak2026!' } });
    assert.equal(r.status, 401);
    assert.equal(r.headers['set-cookie'], undefined);
});

test('correct password sets an HttpOnly, Secure, SameSite=Strict cookie', async () => {
    const r = await call(sessionHandler, { method: 'POST', body: { password: 'correct horse' } });
    assert.equal(r.status, 200);
    const c = r.headers['set-cookie'];
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.match(c, /SameSite=Strict/);
    const s = await call(sessionHandler, { cookie: c.split(';')[0] });
    assert.deepEqual(s.data, { admin: true });
});

test('tampered or expired cookies are not admin', async () => {
    const cookie = await adminCookie();
    const [name, value] = cookie.split('=');
    const [, sig] = value.split('.');
    const future = String(Date.now() + 10 ** 9);
    for (const bad of [`${name}=${future}.${sig}`, `${name}=1.${sig}`, `${name}=garbage`, `${cookie}x`]) {
        const s = await call(sessionHandler, { cookie: bad });
        assert.deepEqual(s.data, { admin: false }, bad);
    }
});

test('login requires a JSON body (CSRF guard)', async () => {
    const r = await call(sessionHandler, { method: 'POST', body: 'password=correct horse', json: false });
    assert.equal(r.status, 415);
});

// ---------------- apps ----------------
test('anyone can list apps', async () => {
    answers.push([{ id: 1, name: 'Tenure', url: 'https://t.example' }]);
    const r = await call(appsHandler);
    assert.equal(r.status, 200);
    assert.equal(r.data.length, 1);
});

test('adding an app requires admin', async () => {
    const r = await call(appsHandler, { method: 'POST', body: { name: 'X', url: 'https://x.example' } });
    assert.equal(r.status, 401);
    assert.equal(queries.filter(q => /insert into public.apps/.test(q.text)).length, 0);
});

test('admin can add an app; javascript: URLs are refused', async () => {
    const cookie = await adminCookie();
    const bad = await call(appsHandler, { method: 'POST', cookie, body: { name: 'X', url: 'javascript:alert(1)' } });
    assert.equal(bad.status, 400);
    const tooLong = await call(appsHandler, { method: 'POST', cookie, body: { name: 'x'.repeat(101), url: 'https://x.example' } });
    assert.equal(tooLong.status, 400);

    answers.push([{ id: 7, name: 'X', url: 'https://x.example/' }]);
    const ok = await call(appsHandler, { method: 'POST', cookie, body: { name: ' X ', url: 'https://x.example', icon: 'chart' } });
    assert.equal(ok.status, 201);
    const insert = queries.find(q => /insert into public.apps/.test(q.text));
    assert.deepEqual(insert.values.slice(0, 2), ['X', 'https://x.example/']);
    assert.ok(queries.some(q => /insert into public.activities/.test(q.text)), 'server logs the action');
});

test('edit/delete read the id from req.query (Vercel dynamic route)', async () => {
    const cookie = await adminCookie();
    answers.push([{ id: 5, name: 'New', url: 'https://n.example/' }]);
    const up = await call(appByIdHandler, { method: 'PATCH', cookie, query: { id: '5' }, body: { name: 'New', url: 'https://n.example' } });
    assert.equal(up.status, 200);
    assert.ok(queries.some(q => /update public.apps/.test(q.text) && q.values.includes(5)));

    answers.push([{ id: 5, name: 'New' }]);
    const del = await call(appByIdHandler, { method: 'DELETE', cookie, query: { id: '5' } });
    assert.equal(del.status, 200);

    const missing = await call(appByIdHandler, { method: 'DELETE', cookie, query: { id: '99' } });
    assert.equal(missing.status, 404);
    const badId = await call(appByIdHandler, { method: 'DELETE', cookie, query: { id: 'abc' } });
    assert.equal(badId.status, 400);
});

test('edit/delete require admin', async () => {
    const r1 = await call(appByIdHandler, { method: 'DELETE', query: { id: '5' } });
    const r2 = await call(appByIdHandler, { method: 'PATCH', query: { id: '5' }, body: { name: 'a', url: 'https://a.example' } });
    assert.equal(r1.status, 401);
    assert.equal(r2.status, 401);
    assert.equal(queries.length, 0);
});

test('database errors become a JSON 500, not a crash', async () => {
    setSqlClient(() => Promise.reject(new Error('connection refused')));
    const r = await call(appsHandler);
    assert.equal(r.status, 500);
    assert.match(r.data.error, /Server error/);
    assert.doesNotMatch(r.data.error, /connection refused/);
});

// ---------------- activities ----------------
test('reading the activity log requires admin', async () => {
    assert.equal((await call(activitiesHandler)).status, 401);
    const cookie = await adminCookie();
    answers.push([]);
    assert.equal((await call(activitiesHandler, { cookie })).status, 200);
});

test('users may only log login/logout; the server writes the text', async () => {
    const forged = await call(activitiesHandler, { method: 'POST', body: { action: 'App removed', user: 'x' } });
    assert.equal(forged.status, 400);
    const ok = await call(activitiesHandler, { method: 'POST', body: { action: 'User login', user: 'Jane Doe' } });
    assert.equal(ok.status, 201);
    const insert = queries.find(q => /insert into public.activities/.test(q.text));
    assert.deepEqual(insert.values, ['User login', 'User "Jane Doe" logged in']);
});

// ---------------- fetch-app-name ----------------
test('fetch-app-name requires admin and refuses internal addresses', async () => {
    assert.equal((await call(fetchNameHandler, { method: 'POST', body: { url: 'https://example.com' } })).status, 401);
    const cookie = await adminCookie();
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://10.0.0.5/', 'http://localhost/', 'file:///etc/passwd']) {
        const r = await call(fetchNameHandler, { method: 'POST', cookie, body: { url } });
        assert.equal(r.status, 400, url);
    }
});

test('isPrivateAddress', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])
        assert.equal(isPrivateAddress(ip), true, ip);
    for (const ip of ['8.8.8.8', '76.76.21.21', '2606:4700::1111'])
        assert.equal(isPrivateAddress(ip), false, ip);
});

test('extractTitle prefers og:site_name and decodes entities', () => {
    assert.equal(extractTitle('<meta property="og:site_name" content="Tenure &amp; Co"><title>x</title>'), 'Tenure & Co');
    assert.equal(extractTitle('<title>\n  Bonus   Tracker </title>'), 'Bonus Tracker');
    assert.equal(extractTitle('<p>nothing</p>'), null);
});

// ---------------- health ----------------
test('health hides details from non-admins', async () => {
    const pub = await call(healthHandler);
    assert.deepEqual(Object.keys(pub.data), ['ok']);
    const cookie = await adminCookie();
    const full = await call(healthHandler, { cookie });
    assert.ok('apps_columns' in full.data);
});

test('unsupported methods get 405', async () => {
    assert.equal((await call(appsHandler, { method: 'DELETE' })).status, 405);
});

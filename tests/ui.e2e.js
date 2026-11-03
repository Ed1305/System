// Browser end-to-end check: serves index.html and the real API handlers on
// a local server (in-memory fake database), then drives the page with
// Playwright. Run with `npm run test:ui` (needs Playwright + Chromium).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { setSqlClient } from '../api/lib/db.js';

process.env.ADMIN_PASSWORD = 'test-pass';
process.env.SESSION_SECRET = 'test-secret';

// ---------- in-memory stand-in for the few queries the API runs ----------
const db = { apps: [], activities: [], nextId: 1 };
function fakeSql(strings, ...v) {
    const q = strings.join('?').replace(/\s+/g, ' ');
    const now = new Date().toISOString();
    let rows = [];
    if (/information_schema/.test(q) && /count/.test(q)) rows = [{ n: 1 }];
    else if (/information_schema/.test(q)) rows = ['id', 'name', 'url', 'platform', 'addedAt', 'icon'].map(c => ({ column_name: c }));
    else if (/select 1 as ok/.test(q)) rows = [{ ok: 1 }];
    else if (/count\(\*\)::int as n from public.apps/.test(q)) rows = [{ n: db.apps.length }];
    else if (/select .* from public.apps/.test(q)) rows = [...db.apps].reverse();
    else if (/insert into public.apps/.test(q)) {
        const app = { id: db.nextId++, name: v[0], url: v[1], platform: v[2], icon: v[3] ?? null, addedAt: now };
        db.apps.push(app); rows = [app];
    } else if (/update public.apps/.test(q)) {
        const id = v[v.length - 1];
        const app = db.apps.find(a => a.id === id);
        if (app) { app.name = v[0]; app.url = v[1]; rows = [app]; }
    } else if (/delete from public.apps/.test(q)) {
        const i = db.apps.findIndex(a => a.id === v[0]);
        if (i > -1) rows = db.apps.splice(i, 1);
    } else if (/insert into public.activities/.test(q)) db.activities.unshift({ id: db.activities.length + 1, action: v[0], details: v[1], timestamp: now });
    else if (/from public.activities/.test(q)) rows = db.activities;
    return Promise.resolve(rows);
}
setSqlClient(fakeSql);

// ---------- tiny Vercel-like server ----------
const routes = {
    '/api/apps': (await import('../api/apps.js')).default,
    '/api/session': (await import('../api/session.js')).default,
    '/api/activities': (await import('../api/activities.js')).default,
    '/api/health': (await import('../api/health.js')).default,
};
const appById = (await import('../api/apps/[id].js')).default;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'text/html');
        return res.end(await readFile(new URL('../index.html', import.meta.url)));
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch { req.body = raw; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (d) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); return res; };
    const m = url.pathname.match(/^\/api\/apps\/([^/]+)$/);
    if (m) { req.query.id = m[1]; return appById(req, res); }
    const h = routes[url.pathname];
    return h ? h(req, res) : res.status(404).json({ error: 'not found' });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;

// ---------- drive the page ----------
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
// CDNs may be unreachable where tests run: stand in for the Tailwind script
// with the few layout utilities the admin modal needs, and skip the rest.
const TAILWIND_SHIM = `document.head.insertAdjacentHTML('beforeend', '<style>' +
  '.fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}.flex{display:flex}' +
  '.items-center{align-items:center}.justify-center{justify-content:center}' +
  '.w-full{width:100%}.max-w-md{max-width:28rem}.p-8{padding:2rem}.bg-gray-800{background:#1f2937}' +
  '</style>');`;
await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript', body: TAILWIND_SHIM }));
await page.route(/cdnjs|fonts\.googleapis|fonts\.gstatic/, r => r.abort());

const step = (name) => console.log('  ✓', name);
try {
    await page.goto(base);
    await page.fill('#usernameInput', 'Jane Doe');
    await page.click('#loginForm button[type=submit]');
    await page.waitForSelector('#appsGrid .apps-empty');
    step('user login shows the dashboard');

    await page.reload();
    await page.waitForSelector('#appsGrid .apps-empty');
    assert.deepEqual(errors, [], 'no script errors after reload with a saved session');
    assert.equal(await page.evaluate(() => typeof window.showAdminModal), 'function');
    step('reload with saved session works (was a crash)');

    const html = await page.content();
    assert.ok(!html.includes('ak2026'), 'no password in page source');
    assert.ok(!/render/i.test(await page.locator('#adminPanel').innerHTML()), 'no Render UI');
    step('no password or Render UI in the page');

    await page.click('#lockBtn');
    await page.fill('#adminPassword', 'wrong');
    await page.click('text=Unlock');
    await page.waitForSelector('#adminError:not(.hidden)');
    assert.match(await page.textContent('#adminError'), /Incorrect password/);
    step('wrong admin password rejected by server');

    await page.fill('#adminPassword', 'test-pass');
    await page.press('#adminPassword', 'Enter');
    await page.waitForSelector('#adminPanel:not(.hidden)');
    step('correct admin password unlocks admin panel');

    await page.fill('#appName', 'Bonus Tracker');
    await page.fill('#appUrl', 'https://bonus.example.com');
    await page.click('#addAppBtn');
    await page.waitForSelector('#appsGrid a.win-tile');
    assert.equal(await page.getAttribute('#appsGrid a.win-tile', 'href'), 'https://bonus.example.com/');
    step('admin can add an app');

    await page.fill('[data-app-id="1"] .app-name-input', 'Bonus Tracker v2');
    await page.click('[data-app-id="1"] .save-app-btn');
    await page.waitForFunction(() => document.querySelector('#appsGrid').textContent.includes('Bonus Tracker V2') || document.querySelector('#appsGrid').textContent.includes('Bonus Tracker v2'));
    step('admin can edit an app (was a 500)');

    await page.reload();
    await page.waitForSelector('#adminPanel:not(.hidden)');
    step('admin mode survives a reload (cookie)');

    await page.click('text=Logout');
    await page.waitForSelector('#adminPanel.hidden', { state: 'attached' });
    const polling = await page.evaluate(() => appPollTimer !== null);
    assert.equal(polling, true, 'tiles keep refreshing after admin logout');
    const after = await page.evaluate(() => fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', url: 'https://x.example' }) }).then(r => r.status));
    assert.equal(after, 401);
    step('admin logout ends the session; tile polling continues');

    db.apps.push({ id: 99, name: 'Evil', url: 'javascript:alert(1)', addedAt: new Date().toISOString() });
    await page.evaluate(() => fetchApps());
    const hrefs = await page.$$eval('a.win-tile', as => as.map(a => a.getAttribute('href')));
    assert.ok(!hrefs.some(h => h.startsWith('javascript')), 'unsafe links neutralised');
    step('stored javascript: links are not rendered as links');

    await page.reload();
    await page.waitForSelector('a.win-tile');
    await page.click('#lockBtn');
    await page.fill('#adminPassword', 'test-pass');
    await page.click('text=Unlock');
    await page.waitForSelector('[data-app-id="99"]');
    await page.click('[data-app-id="99"] .remove-app-btn');
    await page.waitForFunction(() => !document.querySelector('[data-app-id="99"]'));
    step('admin can remove an app (was a 500)');

    assert.ok(db.activities.some(a => a.action === 'User login' && a.details.includes('Jane Doe')));
    assert.ok(db.activities.some(a => a.action === 'App added'));
    assert.ok(db.activities.some(a => a.action === 'Admin login failed'));
    step('activity log written by the server');

    assert.deepEqual(errors, []);
    console.log('UI e2e: all checks passed');
} finally {
    await browser.close();
    server.close();
}

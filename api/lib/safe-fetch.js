// api/lib/safe-fetch.js
// Server-side fetch of a user-supplied URL without letting it reach
// internal networks (SSRF). Every hop — including redirects — must be
// http(s) on a public IP address, and the response body is size-capped.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './http.js';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;

function ipv4Private(ip) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||  // carrier-grade NAT
        (a === 169 && b === 254) ||            // link-local / cloud metadata
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224;                              // multicast / reserved
}

export function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) return ipv4Private(ip);
    if (net.isIPv6(ip)) {
        const v6 = ip.toLowerCase();
        const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return ipv4Private(mapped[1]);
        return v6 === '::' || v6 === '::1' ||
            v6.startsWith('fc') || v6.startsWith('fd') ||   // unique local
            /^fe[89ab]/.test(v6) ||                          // link-local
            v6.startsWith('ff');                             // multicast
    }
    return true; // not an IP at all — refuse
}

async function assertPublic(url) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new HttpError(400, 'Only http(s) URLs can be fetched');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host)
        ? [{ address: host }]
        : await lookup(host, { all: true }).catch(() => {
            throw new HttpError(400, `Could not resolve ${host}`);
        });
    if (addresses.length === 0 || addresses.some(a => isPrivateAddress(a.address))) {
        throw new HttpError(400, 'That URL points to a private or internal address');
    }
}

async function readCapped(res) {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
    }
    reader.cancel().catch(() => {});
    return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8');
}

// Returns the (size-capped) HTML text of a public page.
export async function fetchPublicHtml(rawUrl) {
    let url = new URL(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            await assertPublic(url);
            const res = await fetch(url, {
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AlphaKonnectHub/1.0)',
                    'Accept': 'text/html'
                }
            });
            if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
                url = new URL(res.headers.get('location'), url);
                continue;
            }
            if (!res.ok) throw new HttpError(502, `The site answered HTTP ${res.status}`);
            return await readCapped(res);
        }
        throw new HttpError(502, 'Too many redirects');
    } catch (err) {
        if (err.name === 'AbortError') throw new HttpError(504, 'The site took too long to respond');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// api/fetch-app-name.js
// Admin-only: reads a web app's real name from its page (og:site_name /
// og:title / <title>) so tiles show the application name, not the URL.
import { route, HttpError } from './lib/http.js';
import { requireAdmin } from './lib/auth.js';
import { httpUrl } from './lib/validate.js';
import { fetchPublicHtml } from './lib/safe-fetch.js';

export default route({
    async POST(req, res) {
        requireAdmin(req);
        const url = httpUrl((req.body || {}).url);
        const html = await fetchPublicHtml(url);
        const name = extractTitle(html);
        if (!name) throw new HttpError(422, 'No title found on that page');
        return res.status(200).json({ name: name.slice(0, 100) });
    }
});

// Extract the content attribute from a <meta> tag that contains `key`
// (attribute order doesn't matter)
function metaContent(html, key) {
    const tag = html.match(new RegExp('<meta[^>]*' + key + '[^>]*>', 'i'));
    if (!tag) return null;
    const content = tag[0].match(/content=["']([^"']+)["']/i);
    return content ? content[1] : null;
}

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function extractTitle(html) {
    const ogSite = metaContent(html, 'og:site_name');
    const ogTitle = metaContent(html, 'og:title');
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    for (const candidate of [ogSite, ogTitle, titleTag && titleTag[1]]) {
        if (candidate && candidate.trim()) {
            return decodeEntities(candidate).replace(/\s+/g, ' ').trim();
        }
    }
    return null;
}

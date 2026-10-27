// api/fetch-app-name.js
// Fetches a web app's real name from its page (og:site_name / og:title /
// <title>) so tiles can show the application name instead of the URL.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body || {};
    if (!url) {
        return res.status(400).json({ error: 'Missing url' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const pageRes = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!pageRes.ok) {
            throw new Error('HTTP ' + pageRes.status);
        }
        const html = await pageRes.text();
        const name = extractTitle(html);
        if (!name) {
            throw new Error('No title found on page');
        }
        return res.status(200).json({ name });
    } catch (err) {
        console.error('fetch-app-name error:', err);
        return res.status(500).json({ error: 'Could not fetch app name (' + err.message + ')' });
    }
}

// Extract the content attribute from a <meta> tag that contains `key`
// (attribute order doesn't matter)
function metaContent(html, key) {
    const tag = html.match(new RegExp('<meta[^>]*' + key + '[^>]*>', 'i'));
    if (!tag) return null;
    const content = tag[0].match(/content=["']([^"']+)["']/i);
    return content ? content[1] : null;
}

function extractTitle(html) {
    const ogSite = metaContent(html, 'og:site_name');
    const ogTitle = metaContent(html, 'og:title');
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    for (const candidate of [ogSite, ogTitle, titleTag && titleTag[1]]) {
        if (candidate && candidate.trim()) {
            return candidate.replace(/\s+/g, ' ').trim();
        }
    }
    return null;
}

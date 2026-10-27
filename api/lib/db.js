// api/lib/db.js
// Shared Neon Postgres client for the Vercel API layer.
//
// The connection string comes from the DATABASE_URL environment variable
// (set in Vercel project settings). Use the Neon *pooled* connection
// string (ends with ?pooler=true) — it is designed for serverless use.
import { neon } from '@neondatabase/serverless';

let sqlClient = null;

export default function sql() {
    if (!sqlClient) {
        const url = process.env.DATABASE_URL;
        if (!url) {
            throw new Error('DATABASE_URL is not set on this Vercel project');
        }
        sqlClient = neon(url);
    }
    return sqlClient;
}

let iconColumnCache = null; // null = unknown, true/false = checked

// True if the apps table has an `icon` column (older databases may not).
// Cached after the first check so it costs nothing on later requests.
export async function hasIconColumn() {
    if (iconColumnCache !== null) return iconColumnCache;
    try {
        const rows = await sql()`
            select count(*)::int as n
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'apps'
              and column_name = 'icon'
        `;
        iconColumnCache = !!(rows[0] && rows[0].n > 0);
    } catch (err) {
        iconColumnCache = false;
    }
    return iconColumnCache;
}

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

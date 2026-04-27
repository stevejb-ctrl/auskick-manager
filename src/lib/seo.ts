// Single source of truth for the canonical production host. Used by
// robots.ts, sitemap.ts, and layout.tsx's `metadataBase` so a host
// rename only happens here. Apex (`sirenfooty.com.au`) 301-redirects
// to www at the Vercel domain layer — don't list both anywhere or
// Search Console flags them as duplicates.
export const SITE_URL = "https://www.sirenfooty.com.au";

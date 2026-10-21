import { buildLlmsTxt } from "@/lib/llms-txt";
import { siteUrl } from "@/lib/seo";

// /llms.txt — a plain-text map of Siren for AI tools. Built per request
// because the brand (and so the host in its links) comes from the
// request, as robots.txt and the sitemap do. The middleware lets
// signed-out visitors and crawlers reach it (PUBLIC_FILE_PATHS in
// src/lib/public-routes.ts).
export function GET() {
  return new Response(buildLlmsTxt(siteUrl()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

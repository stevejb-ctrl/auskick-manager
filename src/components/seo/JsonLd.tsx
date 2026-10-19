import { serializeJsonLd } from "@/lib/structured-data";

/**
 * One block of structured data for search engines. It renders on the
 * server, so crawlers that don't run JavaScript still read it. The
 * builders are in src/lib/structured-data.ts.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Safe: serializeJsonLd escapes "<", so the data can't close the tag.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

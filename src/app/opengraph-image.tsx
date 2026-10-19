import { ImageResponse } from "next/og";
import { getBrand } from "@/lib/brand";
import { OG_IMAGE_ALT } from "@/lib/seo";
import { getBrandCopy } from "@/lib/sports/brand-copy";
import type { SportConfig } from "@/lib/sports/types";

// The link preview for every page (WhatsApp, Facebook, Slack, X), drawn
// per brand: sirenfooty.com.au gets field green and the alarm-orange
// dot, sirennetball.com.au court blue. Next adds the og:image tags; the
// root layout sets the rest of the Open Graph fields. Words come from
// the brand copy (content/marketing/brands/*.json, edited in the CMS),
// so the preview follows the site.
//
// Edge runtime so the fonts can be bundled with fetch(new URL(...)).
// The middleware lets this route through for signed-out scrapers.

export const runtime = "edge";
export const alt = OG_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand ladders from globals.css: background is brand-800, small text
// brand-100, and the dot is the wordmark's --siren-mark.
const PALETTES: Record<SportConfig["brand"]["palette"], { bg: string; soft: string; dot: string }> = {
  brand: { bg: "#1F4528", soft: "#CDDFCD", dot: "#D9442D" },
  netball: { bg: "#194B76", soft: "#CFE6F4", dot: "#4A9FD1" },
};
const WARM = "#F7F5F1";
const RING = "rgba(255, 255, 255, 0.09)";

export default async function OpenGraphImage() {
  const brand = getBrand();
  const copy = getBrandCopy(brand.id);
  const palette = PALETTES[brand.brand.palette];
  const headline = `${copy.heroTitle.before}${copy.heroTitle.italic}${copy.heroTitle.after}`;

  const [black, medium] = await Promise.all([
    fetch(new URL("../../node_modules/geist/dist/fonts/geist-sans/Geist-Black.ttf", import.meta.url)).then(
      (r) => r.arrayBuffer(),
    ),
    fetch(new URL("../../node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf", import.meta.url)).then(
      (r) => r.arrayBuffer(),
    ),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: palette.bg,
          color: WARM,
          fontFamily: "Geist",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Centre-circle rings: a nod to the ground, faint enough to
            sit behind the words. */}
        <div
          style={{
            position: "absolute",
            right: -170,
            bottom: -230,
            width: 640,
            height: 640,
            borderRadius: 9999,
            border: `5px solid ${RING}`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 80,
            bottom: 20,
            width: 170,
            height: 170,
            borderRadius: 9999,
            border: `5px solid ${RING}`,
            display: "flex",
          }}
        />

        {/* Wordmark: Geist 900, the dot ~0.19em across, ~2/3 up the "n"
            (SirenWordmark's geometry at 88px). */}
        <div style={{ display: "flex", alignItems: "flex-start", fontSize: 88, fontWeight: 900, letterSpacing: -4.4, lineHeight: 0.9 }}>
          <span>Siren</span>
          <div style={{ width: 17, height: 17, borderRadius: 9999, background: palette.dot, marginLeft: 4, marginTop: 30 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: 2.2, textTransform: "uppercase", color: palette.soft }}>
            {copy.heroEyebrow}
          </div>
          <div style={{ marginTop: 18, fontSize: 78, fontWeight: 900, letterSpacing: -2.7, lineHeight: 1.02 }}>
            {headline}
          </div>
        </div>

        {/* Kept to the left so the rings have the right-hand side. */}
        <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: palette.soft }}>
          {`${brand.brand.host}  ·  ${copy.banner.prefix}`}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: black, weight: 900, style: "normal" },
        { name: "Geist", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}

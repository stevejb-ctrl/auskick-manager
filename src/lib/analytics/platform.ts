// Which kind of Siren sent an event. The iOS and Android apps are a
// Capacitor WebView that loads the live site, so the web SDK runs
// there too, and this property is how we tell them apart.

export type AnalyticsPlatform = "ios" | "android" | "pwa" | "web";

export function analyticsPlatform(env: {
  /** window.Capacitor.getPlatform(), when the bridge is present. */
  capacitor: string | undefined;
  /** matchMedia("(display-mode: standalone)"): installed to the home screen. */
  standalone: boolean;
}): AnalyticsPlatform {
  if (env.capacitor === "ios" || env.capacitor === "android") return env.capacitor;
  return env.standalone ? "pwa" : "web";
}

/** The platform for this browser. Client-only. */
export function currentAnalyticsPlatform(): AnalyticsPlatform {
  return analyticsPlatform({
    capacitor: window.Capacitor?.getPlatform?.(),
    standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  });
}

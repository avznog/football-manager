import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { WebAnalytics } from "@/components/analytics/web-analytics";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Football Manager",
    template: "%s · Football Manager",
  },
  description:
    "Gère ton équipe de football à 7 : calendrier, feuille de match, compositions, mode match en direct et statistiques.",
  applicationName: "Football Manager",
  // Installability (decision 015: a PWA manifest, but no service worker and no push).
  appleWebApp: {
    capable: true,
    title: "Football Manager",
    statusBarStyle: "default",
  },
  // Phone numbers and dates in match cards must not be auto-linked by iOS.
  formatDetection: { telephone: false, date: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the app paint under the notch and the home indicator; the shell then
  // pads itself with env(safe-area-inset-*) (see the safe-* utilities).
  viewportFit: "cover",
  // Hex literals are unavoidable here: <meta> cannot read a CSS variable.
  // These mirror --color-canvas in app/globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1013" },
  ],
};

/**
 * Applies the stored theme before first paint so there is no flash of the wrong
 * theme. Mirrors the CSS contract in globals.css:
 *   - "dark"  → class "dark"   (explicit override)
 *   - "light" → class "light"  (explicit override, disables the media query)
 *   - "system" / missing / unreadable → no class, the media query decides and
 *     an OS change is picked up live.
 */
const themeScript = `(function(){try{var e=document.documentElement,t=localStorage.getItem("fm-theme");if(t==="dark"){e.classList.add("dark");e.style.colorScheme="dark"}else if(t==="light"){e.classList.add("light");e.style.colorScheme="light"}else{e.style.colorScheme="light dark"}}catch(n){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: themeScript mutates <html> class + style
    // before React hydrates.
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        {/*
          Vercel Web Analytics and Speed Insights. Both render nothing and only inject a script,
          and both are no-ops off Vercel, so a local `npm run dev` is unaffected. `WebAnalytics`
          wraps `<Analytics />` to strip the ids out of the path before the beacon leaves the
          browser; Speed Insights needs no wrapper, its `/next` entry point already reports the
          route pattern (`/match/[id]/jeu`) rather than the resolved URL. Their beacons are also
          the reason `proxy.ts` excludes `/_vercel/` from its matcher — see the comment there.
        */}
        <WebAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

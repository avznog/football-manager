import type { MetadataRoute } from "next";

/**
 * Installable PWA manifest. Decision 015: installability only — there is no
 * service worker and no push notification support anywhere in this app.
 *
 * The colours are hex literals because a manifest cannot read a CSS variable.
 * They mirror `--color-canvas` (light) in `app/globals.css`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Football Manager",
    short_name: "FootManager",
    description:
      "Gère ton équipe de football à 7 : calendrier, disponibilités, feuille de match, compositions, mode match en direct et statistiques.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6f8",
    theme_color: "#f4f6f8",
    categories: ["sports", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

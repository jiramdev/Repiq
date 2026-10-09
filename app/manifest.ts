// app/manifest.ts — served at /manifest.webmanifest and linked automatically.
import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";
import { str } from "@/lib/strings";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Repiq",
    short_name: "Repiq",
    description: str.app.description,
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

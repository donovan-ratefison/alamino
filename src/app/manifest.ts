import type { MetadataRoute } from "next";

// Lets a phone install the site on the home screen. No service worker: the app needs the network.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alamino",
    short_name: "Alamino",
    description: "Debt clearing for market traders.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

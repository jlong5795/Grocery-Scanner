import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pantry Scanner",
    short_name: "Pantry",
    description: "Scan the pantry and fridge, keep a shared shopping list.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#047857",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

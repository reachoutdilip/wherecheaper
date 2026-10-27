import type { MetadataRoute } from "next";

// Lets phones install the site to the home screen as an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Where's It Cheaper",
    short_name: "Cheaper",
    description: "Compare gadget prices across countries at today's exchange rates.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F5F7",
    theme_color: "#2F55D4",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

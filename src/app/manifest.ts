import type { MetadataRoute } from "next";

/** Lets ChordBase be added to a phone's or tablet's home screen and open like an app, full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChordBase",
    short_name: "ChordBase",
    description: "Lyrics and chords for your church, in any key.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

import type { MetadataRoute } from "next";
import { getAppIcons } from "@/lib/app-icons";

// ENV_TYPE is a runtime deployment setting, not a build-time setting.
export const dynamic = "force-dynamic";

export default function manifest(): MetadataRoute.Manifest {
  const icons = getAppIcons();
  return {
    id: "/",
    name: "Pi Web",
    short_name: "Pi Web",
    description: "Local web interface for the pi coding agent",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // Deliberately omit theme_color. Android WebAPKs persist it as a custom
    // light toolbar colour, which also wins in dark mode when no custom dark
    // colour exists. Omission lets Chrome choose its system light/dark defaults.
    // BrowserTheme separately supplies the document's adaptive theme-colour tags.
    categories: ["developer", "productivity"],
    lang: "en",
    icons: [
      {
        src: icons.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icons.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icons.maskable512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

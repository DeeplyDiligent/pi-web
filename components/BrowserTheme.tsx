"use client";

import { useTheme } from "@/hooks/useTheme";
import { isDarkTheme } from "@/lib/theme";

/**
 * A single React owner for browser/PWA theme colours, including the sign-in page.
 * In auto mode Chrome selects the matching tag natively, even before hydration
 * or while JavaScript is suspended as the user changes Android's display mode.
 * Keep both content values stable; manual overrides change only their media.
 */
export function BrowserTheme() {
  const { preference } = useTheme();
  const dark = preference !== "auto" && isDarkTheme(preference);
  return (
    <>
      <meta
        name="theme-color"
        content="#ffffff"
        media={preference === "auto" ? "(prefers-color-scheme: light)" : dark ? "not all" : "all"}
      />
      <meta
        name="theme-color"
        content="#1a1a1a"
        media={preference === "auto" ? "(prefers-color-scheme: dark)" : dark ? "all" : "not all"}
      />
    </>
  );
}

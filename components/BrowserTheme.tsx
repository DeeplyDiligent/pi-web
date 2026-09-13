"use client";

import { useTheme } from "@/hooks/useTheme";

/**
 * A single React owner for browser/PWA theme colours, including the sign-in page.
 * In auto mode Chrome selects the matching tag natively, even before hydration
 * or while JavaScript is suspended as the user changes Android's display mode.
 * Keep both content values stable; manual overrides change only their media.
 */
export function BrowserTheme() {
  const { preference } = useTheme();
  return (
    <>
      <meta
        name="theme-color"
        content="#ffffff"
        media={preference === "auto" ? "(prefers-color-scheme: light)" : preference === "light" ? "all" : "not all"}
      />
      <meta
        name="theme-color"
        content="#1a1a1a"
        media={preference === "auto" ? "(prefers-color-scheme: dark)" : preference === "dark" ? "all" : "not all"}
      />
    </>
  );
}

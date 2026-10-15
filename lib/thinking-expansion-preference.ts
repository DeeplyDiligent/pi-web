const STORAGE_KEY = "pi-thinking-expanded";

// Broadcast so already-mounted ThinkingBlock instances update when the
// preference changes in the settings panel.
export const THINKING_EXPANDED_EVENT = "pi-thinking-expanded-changed";

export function isThinkingExpandedByDefault(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Preserve the fork's expanded default and respect an explicit choice.
    return window.localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setThinkingExpandedByDefault(expanded: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(expanded));
  } catch {
    // Nothing was saved, so there is no change to announce.
    return;
  }
  window.dispatchEvent(new Event(THINKING_EXPANDED_EVENT));
}

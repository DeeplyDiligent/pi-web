const STORAGE_KEY = "pi-thinking-expanded";

// Broadcast so already-mounted ThinkingBlock instances update when the
// preference changes in the settings panel.
export const THINKING_EXPANDED_EVENT = "pi-thinking-expanded-changed";

export function isThinkingExpandedByDefault(): boolean {
  if (typeof window === "undefined") return true;
  // Preserve the fork's expanded default, while respecting an explicit choice.
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setThinkingExpandedByDefault(expanded: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, String(expanded));
  window.dispatchEvent(new Event(THINKING_EXPANDED_EVENT));
}

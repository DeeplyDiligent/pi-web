"use client";

import { useSyncExternalStore } from "react";
import { loadSessionListView, saveSessionListView, SESSION_LIST_VIEW_STORAGE_KEY, type SessionListView } from "@/lib/sidebar-prefs";

let view: SessionListView | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): SessionListView {
  return view ??= loadSessionListView();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== SESSION_LIST_VIEW_STORAGE_KEY) return;
  view = loadSessionListView();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    // Re-read after a period without subscribers, when storage events were not observed.
    view = loadSessionListView();
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setSessionListView(next: SessionListView): void {
  view = next;
  saveSessionListView(next);
  listeners.forEach((listener) => listener());
}

/** Server and hydration renders use the grouped default; browser storage follows on mount. */
export function useSessionListView(): SessionListView {
  return useSyncExternalStore(subscribe, getSnapshot, () => "projects");
}

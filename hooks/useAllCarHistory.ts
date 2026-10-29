"use client";

import { useEffect, useState } from "react";

interface HistoryPage { hasMore: boolean; oldestEntryId: string | null }
interface Options {
  enabled: boolean;
  sessionId: string | null;
  leafId: string | null;
  cursor: string | null;
  hasMore: boolean;
  busyRef: { current: boolean };
  loadPage: (before: string, signal: AbortSignal) => Promise<HistoryPage | undefined>;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });
}

/** Each cursor commit starts the next page, automatically, until no history remains. */
export function useAllCarHistory({ enabled, sessionId, leafId, cursor, hasMore, busyRef, loadPage }: Options) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [onlineRevision, setOnlineRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const online = () => setOnlineRevision((value) => value + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !sessionId || !hasMore) { setLoading(false); setError(false); return; }
    if (!cursor) { setLoading(false); setError(true); return; }
    const controller = new AbortController();
    const { signal } = controller;
    let ownsLock = false;
    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        // Cooperate with normal-chat restoration/search already in flight.
        while (busyRef.current && !signal.aborted) await wait(25, signal);
        if (signal.aborted) return;
        busyRef.current = true;
        ownsLock = true;
        for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
          const page = await loadPage(cursor, signal).catch(() => undefined);
          if (signal.aborted) return;
          if (page) {
            if (page.hasMore && (!page.oldestEntryId || page.oldestEntryId === cursor)) {
              throw new Error("History cursor did not advance");
            }
            // loadPage commits the new cursor. React then starts the next page.
            if (!page.hasMore) setLoading(false);
            return;
          }
          if (attempt < 2) await wait(150 * (attempt + 1), signal);
        }
        if (!signal.aborted) throw new Error("Could not load conversation history");
      } catch {
        if (!signal.aborted) { setError(true); setLoading(false); }
      } finally {
        if (ownsLock) busyRef.current = false;
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled, sessionId, leafId, cursor, hasMore, busyRef, loadPage, onlineRevision]);
  return { loading, error };
}

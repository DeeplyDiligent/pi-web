// One screen lock shared by recording and speech playback. Browsers release it
// when hidden; only request it again once the page is visible and still in use.
export interface ScreenLock {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void, options?: { once: boolean }): void;
}

interface WakeLockEnvironment {
  isVisible(): boolean;
  request(): Promise<ScreenLock>;
  listen(listener: () => void): () => void;
}

export function createScreenWakeLock(environment: WakeLockEnvironment) {
  let users = 0;
  let lock: ScreenLock | null = null;
  let pending = false;
  let unlisten: (() => void) | null = null;

  const release = (sentinel: ScreenLock) => {
    void sentinel.release().catch(() => {});
  };

  const sync = () => {
    if (!users || !environment.isVisible()) {
      if (lock) {
        const previous = lock;
        lock = null;
        release(previous);
      }
      return;
    }
    if (pending || (lock && !lock.released)) return;
    pending = true;
    void environment.request().then((sentinel) => {
      if (!users || !environment.isVisible()) {
        release(sentinel);
        return;
      }
      lock = sentinel;
      sentinel.addEventListener("release", () => {
        if (lock === sentinel) lock = null;
        // Do not loop if the OS refuses to keep the screen awake. A later
        // visibility/focus event or new activity can try again.
      }, { once: true });
    }).catch(() => {
      // Unsupported, denied, or battery-saving policy: audio must still work.
    }).finally(() => {
      pending = false;
    });
  };

  return {
    acquire() {
      users += 1;
      if (!unlisten) unlisten = environment.listen(sync);
      sync();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        users -= 1;
        if (!users) {
          unlisten?.();
          unlisten = null;
        }
        sync();
      };
    },
  };
}

let shared: ReturnType<typeof createScreenWakeLock> | undefined;

export function keepScreenAwake(): () => void {
  if (typeof navigator === "undefined" || !navigator.wakeLock) return () => {};
  shared ??= createScreenWakeLock({
    isVisible: () => document.visibilityState === "visible",
    request: () => navigator.wakeLock.request("screen"),
    listen: (listener) => {
      document.addEventListener("visibilitychange", listener);
      window.addEventListener("focus", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
        window.removeEventListener("focus", listener);
      };
    },
  });
  return shared.acquire();
}

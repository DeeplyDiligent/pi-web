"use client";

import { useEffect } from "react";
import { keepScreenAwake } from "@/lib/screen-wake-lock";

/** Prevent automatic screen sleep while audio is active, where supported. */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (active) return keepScreenAwake();
  }, [active]);
}

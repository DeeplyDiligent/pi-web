"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { captureCarReturnPosition, restoreCarReturnPosition, type CarReturnPosition } from "@/lib/car-scroll-return";

/** Normal chat stays mounted but hidden in car mode. Save its visible position before that switch. */
export function useCarScrollReturn(carMode: boolean, containerRef: RefObject<HTMLDivElement | null>, sessionKey: string, contentVersion: unknown) {
  const savedRef = useRef<CarReturnPosition | null>(null);
  const sessionRef = useRef(sessionKey);
  const wasCarRef = useRef(false);
  useLayoutEffect(() => {
    if (sessionRef.current !== sessionKey) { savedRef.current = null; sessionRef.current = sessionKey; }
    const returning = wasCarRef.current && !carMode;
    wasCarRef.current = carMode;
    const container = containerRef.current;
    if (carMode || !container) return;
    if (returning) restoreCarReturnPosition(container, savedRef.current);
    let active = true;
    const capture = () => { if (active) savedRef.current = captureCarReturnPosition(container); };
    capture();
    container.addEventListener("scroll", capture, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(capture);
    observer?.observe(container);
    return () => { active = false; container.removeEventListener("scroll", capture); observer?.disconnect(); };
  }, [carMode, containerRef, sessionKey, contentVersion]);
}

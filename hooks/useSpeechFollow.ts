"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createSpeechTextTracker, revealSpeechRange, type SpeechProgressStore } from "@/lib/speech-follow";

interface TextPart { node: Text; start: number; end: number }

export function useSpeechFollow(store: SpeechProgressStore | null, containerRef: RefObject<HTMLDivElement | null>, viewKey: unknown) {
  const cacheRef = useRef<{
    root: HTMLElement;
    text: string;
    parts: TextPart[];
    track: ReturnType<typeof createSpeechTextTracker>;
  } | null>(null);

  useLayoutEffect(() => {
    const follow = () => {
      const container = containerRef.current;
      const progress = store?.getSnapshot();
      if (!progress || !container) { cacheRef.current = null; return; }
      const root = Array.from(container.querySelectorAll<HTMLElement>("[data-speech-response-key]"))
        .find((element) => element.dataset.speechResponseKey === progress.key);
      if (!root) { cacheRef.current = null; return; }
      let cache = cacheRef.current;
      if (!cache || cache.root !== root || cache.text !== progress.text || cache.parts.some((part) => !root.contains(part.node))) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const parts: TextPart[] = [];
        let visible = "";
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (!node.parentElement?.closest(".markdown-body") || node.parentElement.closest("button, [aria-hidden=true], script, style")) continue;
          parts.push({ node, start: visible.length, end: visible.length + node.length });
          visible += node.data + " ";
        }
        cache = { root, text: progress.text, parts, track: createSpeechTextTracker(progress.text, visible) };
        cacheRef.current = cache;
      }
      const match = cache.track(progress.charIndex);
      if (!match) return;
      const first = cache.parts.find((part) => part.start <= match.start && part.end > match.start);
      const last = cache.parts.find((part) => part.start < match.end && part.end >= match.end);
      if (!first || !last) return;
      const range = document.createRange();
      range.setStart(first.node, match.start - first.start);
      range.setEnd(last.node, match.end - last.start);
      revealSpeechRange(container, range);
    };
    follow();
    const unsubscribe = store?.subscribe(follow);
    return () => { unsubscribe?.(); cacheRef.current = null; };
  }, [store, containerRef, viewKey]);
}

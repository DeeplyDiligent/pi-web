"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeechText } from "@/lib/speech-text";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { createSpeechProgressStore, splitSpeechText } from "@/lib/speech-follow";

const AUTO_READ_STORAGE_KEY = "pi-auto-read-responses";

export function useSpeechSynthesis(locale: string) {
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [speechProgress] = useState(createSpeechProgressStore);
  const generationRef = useRef(0);
  useScreenWakeLock(speakingKey !== null);

  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    try {
      setAutoReadEnabled(localStorage.getItem(AUTO_READ_STORAGE_KEY) === "true");
    } catch {
      // Browser storage is best-effort.
    }
    return () => {
      generationRef.current += 1;
      window.speechSynthesis?.cancel();
      speechProgress.set(null);
    };
  }, [speechProgress]);

  const stopSpeaking = useCallback(() => {
    generationRef.current += 1;
    window.speechSynthesis?.cancel();
    setSpeakingKey(null);
    speechProgress.set(null);
  }, [speechProgress]);

  const speakResponse = useCallback((markdown: string, key: string, onComplete?: () => void) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    if (speakingKey === key) {
      stopSpeaking();
      return;
    }

    const text = prepareSpeechText(markdown);
    const chunks = splitSpeechText(text);
    if (chunks.length === 0) return;
    const generation = ++generationRef.current;
    window.speechSynthesis.cancel();
    setSpeakingKey(key);

    const speakChunk = (index: number) => {
      if (generationRef.current !== generation) return;
      if (index >= chunks.length) {
        setSpeakingKey(null);
        speechProgress.set(null);
        onComplete?.();
        return;
      }
      const chunk = chunks[index];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = locale;
      const reportProgress = (offset: number) => {
        if (generationRef.current === generation) speechProgress.set({ key, text, charIndex: chunk.start + offset });
      };
      reportProgress(0);
      utterance.onboundary = (event) => reportProgress(event.charIndex);
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        if (generationRef.current === generation) {
          generationRef.current += 1;
          setSpeakingKey(null);
          speechProgress.set(null);
        }
      };
      window.speechSynthesis.speak(utterance);
    };
    speakChunk(0);
  }, [locale, speakingKey, speechProgress, stopSpeaking]);

  const setAutoRead = useCallback((enabled: boolean, options?: { temporary?: boolean }) => {
    setAutoReadEnabled(enabled);
    try {
      // Car mode is temporary. Persist "off" immediately, not in an unload
      // handler, since phones can kill a background page without running one.
      localStorage.setItem(AUTO_READ_STORAGE_KEY, String(enabled && !options?.temporary));
    } catch {
      // Keep the current page usable when storage is unavailable.
    }
  }, []);

  return { autoReadEnabled, setAutoReadEnabled: setAutoRead, speechSynthesisSupported: supported, speakResponse, speakingKey, speechProgress, stopSpeaking };
}

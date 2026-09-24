"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeechText } from "@/lib/speech-text";

const AUTO_READ_STORAGE_KEY = "pi-auto-read-responses";
const MAX_UTTERANCE_CHARS = 1800;

function splitForSpeech(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > MAX_UTTERANCE_CHARS) {
    const window = remaining.slice(0, MAX_UTTERANCE_CHARS + 1);
    const sentenceBreak = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    const wordBreak = window.lastIndexOf(" ");
    const splitAt = sentenceBreak > MAX_UTTERANCE_CHARS / 2 ? sentenceBreak + 1 : wordBreak > 0 ? wordBreak : MAX_UTTERANCE_CHARS;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function useSpeechSynthesis(locale: string) {
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const generationRef = useRef(0);

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
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    generationRef.current += 1;
    window.speechSynthesis?.cancel();
    setSpeakingKey(null);
  }, []);

  const speakResponse = useCallback((markdown: string, key: string, onComplete?: () => void) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    if (speakingKey === key) {
      stopSpeaking();
      return;
    }

    const chunks = splitForSpeech(prepareSpeechText(markdown));
    if (chunks.length === 0) return;
    const generation = ++generationRef.current;
    window.speechSynthesis.cancel();
    setSpeakingKey(key);

    const speakChunk = (index: number) => {
      if (generationRef.current !== generation) return;
      if (index >= chunks.length) {
        setSpeakingKey(null);
        onComplete?.();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = locale;
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        if (generationRef.current === generation) setSpeakingKey(null);
      };
      window.speechSynthesis.speak(utterance);
    };
    speakChunk(0);
  }, [locale, speakingKey, stopSpeaking]);

  const setAutoRead = useCallback((enabled: boolean) => {
    setAutoReadEnabled(enabled);
    try {
      localStorage.setItem(AUTO_READ_STORAGE_KEY, String(enabled));
    } catch {
      // Keep the current page usable when storage is unavailable.
    }
  }, []);

  return { autoReadEnabled, setAutoReadEnabled: setAutoRead, speechSynthesisSupported: supported, speakResponse, speakingKey, stopSpeaking };
}

export interface SpeechProgress {
  key: string;
  /** The prepared text, not Markdown. Boundary offsets refer to this string. */
  text: string;
  charIndex: number;
}

export interface SpeechProgressStore {
  getSnapshot(): SpeechProgress | null;
  set(progress: SpeechProgress | null): void;
  subscribe(listener: () => void): () => void;
}

/** Boundary events move the scroller directly, without re-rendering the app for every word. */
export function createSpeechProgressStore(): SpeechProgressStore {
  let progress: SpeechProgress | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => progress,
    set(value) { progress = value; for (const listener of listeners) listener(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/** Short utterances also provide a paragraph-sized fallback on voices without boundary events. */
export function splitSpeechText(text: string, maxChars = 320): { text: string; start: number }[] {
  const chunks: { text: string; start: number }[] = [];
  let start = 0;
  while (start < text.length) {
    while (/\s/.test(text[start] ?? "") && start < text.length) start++;
    if (start >= text.length) break;
    let end = text.length;
    if (end - start > maxChars) {
      const sample = text.slice(start, start + maxChars + 1);
      const sentence = Math.max(sample.lastIndexOf(". "), sample.lastIndexOf("! "), sample.lastIndexOf("? "), sample.lastIndexOf("\n"));
      const space = sample.lastIndexOf(" ");
      end = start + (sentence > maxChars / 2 ? sentence + 1 : space > 0 ? space : maxChars);
    }
    const chunk = text.slice(start, end).trimEnd();
    if (chunk) chunks.push({ text: chunk, start });
    start = end;
  }
  return chunks;
}

interface Word { text: string; start: number; end: number }
function words(text: string): Word[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    text: match[0].toLocaleLowerCase(), start: match.index, end: match.index + match[0].length,
  }));
}

/** Match speech to rendered words, not Markdown offsets. Table introductions have no DOM equivalent. */
export function createSpeechTextTracker(spoken: string, visible: string) {
  const tableIntroductions = Array.from(spoken.matchAll(/Table with headings:/g), (match) => ({ start: match.index, end: match.index + match[0].length }));
  const speechWords = words(spoken).filter((word) => !tableIntroductions.some((intro) => word.start >= intro.start && word.end <= intro.end));
  const visibleWords = words(visible);
  const candidates = new Map<string, number[]>();
  visibleWords.forEach((word, index) => {
    const indices = candidates.get(word.text) ?? [];
    indices.push(index);
    candidates.set(word.text, indices);
  });
  let previousSpeech = -1;
  let previousVisible = 0;
  return (charIndex: number): { start: number; end: number } | null => {
    let index = speechWords.findIndex((word) => word.end > charIndex);
    if (index < 0) index = speechWords.length - 1;
    if (index < previousSpeech) previousVisible = 0;
    previousSpeech = index;
    // Skip invented words such as "Table with headings", but only a few words,
    // so a mismatch never scrolls ahead to a later paragraph.
    for (let next = index; next >= 0 && next < Math.min(index + 5, speechWords.length); next++) {
      const options = candidates.get(speechWords[next].text) ?? [];
      let best = -1;
      let bestScore = -1;
      for (const candidate of options) {
        if (candidate < previousVisible) continue;
        let score = 0;
        for (let delta = -3; delta <= 3; delta++) {
          if (delta && speechWords[next + delta]?.text === visibleWords[candidate + delta]?.text && speechWords[next + delta]) score++;
        }
        // A generated word (for example an empty table cell's "blank")
        // must not jump to an unrelated occurrence much later in the answer.
        if (score === 0 && candidate > previousVisible + 4) continue;
        if (score > bestScore) { best = candidate; bestScore = score; }
      }
      if (best >= 0) {
        previousVisible = best;
        return { start: visibleWords[best].start, end: visibleWords[best].end };
      }
    }
    return null;
  };
}

/** Scroll just the chat scroller, never the outer page or the composer. */
export function revealSpeechRange(container: HTMLElement, range: Range) {
  const bounds = range.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  const padding = Math.min(32, viewport.height / 4);
  if (!bounds.height || !viewport.height) return;
  if (bounds.top < viewport.top + padding || bounds.bottom > viewport.bottom - padding) {
    container.scrollTop += bounds.top - viewport.top - viewport.height * 0.3;
  }
}

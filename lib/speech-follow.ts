export interface SpeechProgress {
  key: string;
  /** The prepared text, not Markdown. Boundary offsets refer to this string. */
  text: string;
  charIndex: number;
  /** Native word timing is optional. Otherwise highlight the utterance's sentence. */
  wordBoundary?: boolean;
  sentenceStart?: number;
  sentenceEnd?: number;
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

/** Each sentence gets its own utterance, so even voices without boundaries report reliable sentence progress. */
export function splitSpeechText(text: string, maxChars = 320): { text: string; start: number; sentenceStart: number; sentenceEnd: number }[] {
  const chunks: { text: string; start: number; sentenceStart: number; sentenceEnd: number }[] = [];
  const limit = Number.isFinite(maxChars) ? Math.max(2, Math.floor(maxChars)) : 320;
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null;
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const sentences = segmenter ? Array.from(segmenter.segment(line[0]))
      : Array.from(line[0].matchAll(/\S[\s\S]*?(?:[.!?]+["'”’\])]*(?=\s|$)|[。！？]+|$)/g), (match) => ({ segment: match[0], index: match.index }));
    for (const sentence of sentences) {
      const content = sentence.segment.trim();
      if (!content) continue;
      const sentenceStart = line.index + sentence.index + sentence.segment.indexOf(content);
      const sentenceEnd = sentenceStart + content.length;
      let start = sentenceStart;
      while (start < sentenceEnd) {
        while (start < sentenceEnd && /\s/.test(text[start])) start++;
        if (start >= sentenceEnd) break;
        let end = Math.min(sentenceEnd, start + limit);
        if (end < sentenceEnd) {
          const space = text.slice(start, end + 1).search(/\s\S*$/);
          if (space > 0) end = start + space;
          // An unbroken Unicode word may need a hard cut; keep surrogate pairs intact.
          else if (text.charCodeAt(end - 1) >= 0xD800 && text.charCodeAt(end - 1) <= 0xDBFF) end--;
        }
        const chunk = text.slice(start, end).trimEnd();
        if (chunk) chunks.push({ text: chunk, start, sentenceStart, sentenceEnd });
        start = end;
      }
    }
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
  const trackWord = (charIndex: number, endCharIndex = Infinity): { start: number; end: number } | null => {
    let index = speechWords.findIndex((word) => word.end > charIndex);
    if (index < 0) index = speechWords.length - 1;
    if (index < previousSpeech) previousVisible = 0;
    previousSpeech = index;
    // Skip invented words such as "Table with headings", but only a few words,
    // so a mismatch never scrolls ahead to a later paragraph.
    for (let next = index; next >= 0 && next < Math.min(index + 5, speechWords.length) && speechWords[next].start < endCharIndex; next++) {
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
  return (charIndex: number, endCharIndex?: number): { start: number; end: number } | null => {
    if (endCharIndex === undefined) return trackWord(charIndex);
    let start: number | undefined;
    let end: number | undefined;
    for (const word of speechWords) {
      if (word.start < charIndex || word.start >= endCharIndex) continue;
      const match = trackWord(word.start, endCharIndex);
      if (match) { start ??= match.start; end = match.end; }
    }
    return start !== undefined && end !== undefined ? { start, end } : null;
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

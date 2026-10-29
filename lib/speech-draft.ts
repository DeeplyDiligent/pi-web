export interface SpeechDraftRange { start: number; end: number }

/** The live preview and final insertion must show the same complete draft. */
export function insertSpeechTranscript(value: string, range: SpeechDraftRange | null, transcript: string) {
  const text = transcript.trim();
  if (!text || !range) return null;
  const before = value.slice(0, range.start);
  const after = value.slice(range.end);
  const leadingSpace = before && !/\s$/.test(before) ? " " : "";
  const trailingSpace = after && !/^\s/.test(after) ? " " : "";
  const inserted = leadingSpace + text + trailingSpace;
  return {
    value: before + inserted + after,
    cursor: before.length + leadingSpace.length + text.length,
    end: range.start + inserted.length,
  };
}

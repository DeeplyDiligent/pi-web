import type { AssistantMessage, TextContent } from "./types";

/** Return only the assistant's visible answer text. Thinking and tool calls are never spoken. */
export function getAssistantSpeechText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Remove common Markdown punctuation while retaining the words a response conveys. */
export function prepareSpeechText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

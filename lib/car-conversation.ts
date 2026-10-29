import type { AgentMessage, AssistantMessage } from "./types";
import { isMessageGroupAnchor, splitFinalAssistantBlocks } from "./message-display";
import { getAssistantSpeechText } from "./speech-text";

export interface CarConversationRow {
  index: number;
  role: "user" | "assistant";
  text: string;
}

/** Every loaded Q&A, with the same final-answer boundary as the normal chat. */
export function getCarConversationRows(messages: readonly AgentMessage[]): CarConversationRow[] {
  const rows: CarConversationRow[] = [];
  let finalAssistant = -1;
  const finishTurn = () => {
    if (finalAssistant < 0) return;
    const message = messages[finalAssistant] as AssistantMessage;
    const text = getAssistantSpeechText({ ...message, content: splitFinalAssistantBlocks(message).answerBlocks });
    if (text) rows.push({ index: finalAssistant, role: "assistant", text });
    finalAssistant = -1;
  };
  messages.forEach((message, index) => {
    if (isMessageGroupAnchor(message)) finishTurn();
    if (message.role === "user") {
      const text = typeof message.content === "string" ? message.content
        : message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      if (text.trim()) rows.push({ index, role: "user", text });
    } else if (message.role === "assistant") {
      finalAssistant = index;
    }
  });
  finishTurn();
  return rows;
}

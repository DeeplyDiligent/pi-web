"use client";

import { memo, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { AgentMessage } from "@/lib/types";
import type { SpeechProgressStore } from "@/lib/speech-follow";
import { getCarConversationRows } from "@/lib/car-conversation";
import { captureScrollDistance, isScrollAtTail, restoreScrollTop } from "@/lib/chat-lazy-load";
import { useI18n } from "@/hooks/useI18n";
import { MarkdownBody } from "./MarkdownBody";

interface Props {
  messages: readonly AgentMessage[];
  messageKeys: readonly string[];
  sessionKey: string;
  containerRef: RefObject<HTMLDivElement | null>;
  speechProgress: SpeechProgressStore | null;
  loadingHistory: boolean;
  historyError: boolean;
  busyLabel?: string;
  cwd?: string;
  onOpenFile?: (path: string, page?: number) => void;
}

export const CarConversation = memo(function CarConversation({ messages, messageKeys, sessionKey, containerRef, speechProgress, loadingHistory, historyError, busyLabel, cwd, onOpenFile }: Props) {
  const { t } = useI18n();
  const rows = useMemo(() => getCarConversationRows(messages), [messages]);
  const keyOf = (index: number) => `${sessionKey}:${messageKeys[index] ?? messages[index]?.timestamp ?? index}`;
  const firstKey = rows[0] ? keyOf(rows[0].index) : "";
  const lastQuestion = rows.findLast((row) => row.role === "user");
  const lastQuestionKey = lastQuestion ? keyOf(lastQuestion.index) : "";
  const followingTailRef = useRef(true);
  const layoutRef = useRef<{ firstKey: string; question: string; distance: number; loading: boolean; error: boolean } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previous = layoutRef.current;
    const newQuestion = previous && previous.question !== lastQuestionKey;
    if (previous && !newQuestion && !followingTailRef.current
      && (previous.firstKey !== firstKey || previous.loading !== loadingHistory || previous.error !== historyError)) {
      container.scrollTop = restoreScrollTop(container.scrollHeight, previous.distance);
    } else if (!previous || newQuestion || (followingTailRef.current && !speechProgress?.getSnapshot())) {
      container.scrollTop = container.scrollHeight;
    }
    layoutRef.current = { firstKey, question: lastQuestionKey, distance: captureScrollDistance(container.scrollHeight, container.scrollTop), loading: loadingHistory, error: historyError };
  }, [containerRef, firstKey, lastQuestionKey, loadingHistory, historyError, rows, speechProgress]);

  return (
    <div ref={containerRef} className="car-conversation" data-car-history="true" role="region" aria-label="Conversation" aria-busy={loadingHistory}
      onScroll={(event) => {
        const container = event.currentTarget;
        followingTailRef.current = isScrollAtTail(container.scrollTop, container.clientHeight, container.scrollHeight, 64);
        if (layoutRef.current) layoutRef.current.distance = captureScrollDistance(container.scrollHeight, container.scrollTop);
      }}>
      {loadingHistory && <p role="status">{t("chat.loadingSession")}</p>}
      {historyError && <p role="alert">Could not load the full conversation.</p>}
      {rows.map((row) => row.role === "user"
        ? <div key={keyOf(row.index)} className="car-user-message"><span>You</span><p>{row.text}</p></div>
        : <div key={keyOf(row.index)} className="car-answer" data-speech-response-key={keyOf(row.index)}><span>Pi</span>
            <MarkdownBody cwd={cwd} onOpenFile={onOpenFile}>{row.text}</MarkdownBody>
          </div>)}
      {busyLabel && <p role="status">{busyLabel}</p>}
    </div>
  );
});

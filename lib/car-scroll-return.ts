import { isScrollAtTail } from "./chat-lazy-load";

export interface CarReturnPosition {
  atBottom: boolean;
  scrollTop: number;
  anchorKey?: string;
  anchorOffset?: number;
}

/** Remember a visible message, not just pixels, because history may be prepended in car mode. */
export function captureCarReturnPosition(container: HTMLElement): CarReturnPosition {
  const position: CarReturnPosition = {
    atBottom: isScrollAtTail(container.scrollTop, container.clientHeight, container.scrollHeight),
    scrollTop: container.scrollTop,
  };
  const top = container.getBoundingClientRect().top;
  const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-message-key]"))
    .find((element) => element.getBoundingClientRect().bottom > top);
  if (anchor) {
    position.anchorKey = anchor.dataset.messageKey;
    position.anchorOffset = anchor.getBoundingClientRect().top - top;
  }
  return position;
}

export function restoreCarReturnPosition(container: HTMLElement, position: CarReturnPosition | null) {
  if (!position || position.atBottom) { container.scrollTop = container.scrollHeight; return; }
  const anchor = Array.from(container.querySelectorAll<HTMLElement>("[data-message-key]"))
    .find((element) => element.dataset.messageKey === position.anchorKey);
  if (anchor && position.anchorOffset !== undefined) {
    container.scrollTop += anchor.getBoundingClientRect().top - container.getBoundingClientRect().top - position.anchorOffset;
  } else {
    container.scrollTop = position.scrollTop;
  }
}

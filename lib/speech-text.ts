import type { AssistantMessage, TextContent } from "./types";

/** Return only the assistant's visible answer text. Thinking and tool calls are never spoken. */
export function getAssistantSpeechText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Split GFM cells, preserving escaped pipes and pipes inside inline code. */
function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let codeFence = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (line[i] === "`") {
      const run = line.slice(i).match(/^`+/)![0];
      if (!codeFence) codeFence = run;
      else if (codeFence === run) codeFence = "";
      cell += run;
      i += run.length - 1;
    } else if (line[i] === "|" && !codeFence) {
      cells.push(cell.trim());
      cell = "";
    } else cell += line[i];
  }
  cells.push(cell.trim());
  if (line.trim().startsWith("|")) cells.shift();
  if (line.trim().endsWith("|") && cells.at(-1) === "") cells.pop();
  return cells;
}

function spokenTables(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let fence: string | null = null;
  const sentence = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`;
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].trim().match(/^(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
    const headings = tableCells(lines[i]);
    const divider = i + 1 < lines.length ? tableCells(lines[i + 1]) : [];
    if (fence || !lines[i].includes("|") || divider.length !== headings.length || !divider.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      output.push(lines[i]);
      continue;
    }
    output.push(sentence(`Table with headings: ${headings.join(", ")}`));
    i++;
    while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes("|")) {
      const cells = tableCells(lines[++i]);
      output.push(sentence(headings.map((_, index) => cells[index] || "blank").join(", ")));
    }
  }
  return output.join("\n");
}

/** Turn response Markdown into concise spoken text for manual and automatic playback. */
export function prepareSpeechText(markdown: string): string {
  return spokenTables(markdown)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gm, "")
    .replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

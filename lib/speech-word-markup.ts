import type { Element, ElementContent, Root } from "hast";

const SKIP_TAGS = new Set(["pre", "code", "button", "script", "style", "svg", "math", "audio", "video", "textarea"]);

/** Stable word spans for car-mode speech. Never split React-owned text during playback. */
export function rehypeSpeechWords() {
  return (tree: Root): void => {
    const visit = (parent: Root | Element): void => {
      if (parent.type === "element") {
        const classes = parent.properties.className;
        if (SKIP_TAGS.has(parent.tagName) || parent.properties.ariaHidden === true || parent.properties.ariaHidden === "true"
          || (Array.isArray(classes) && classes.some((name) => String(name).startsWith("katex")))) return;
      }
      for (let index = 0; index < parent.children.length; index++) {
        const child = parent.children[index];
        if (child.type === "element") {
          visit(child);
        } else if (child.type === "text") {
          const nodes: ElementContent[] = [];
          let start = 0;
          for (const match of child.value.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
            if (match.index > start) nodes.push({ type: "text", value: child.value.slice(start, match.index) });
            nodes.push({ type: "element", tagName: "span", properties: { dataSpeechWord: "" }, children: [{ type: "text", value: match[0] }] });
            start = match.index + match[0].length;
          }
          if (!nodes.length) continue;
          if (start < child.value.length) nodes.push({ type: "text", value: child.value.slice(start) });
          parent.children.splice(index, 1, ...nodes);
          index += nodes.length - 1;
        }
      }
    };
    visit(tree);
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { rehypeSpeechWords } from "./speech-word-markup.ts";

const text = (value) => ({ type: "text", value });
const element = (tagName, children, properties = {}) => ({ type: "element", tagName, properties, children });
function words(node) {
  return node.type === "element" && "dataSpeechWord" in node.properties ? [node.children[0].value]
    : node.children?.flatMap(words) ?? [];
}
function visible(node) {
  return node.type === "text" ? node.value : node.children?.map(visible).join("") ?? "";
}

test("car speech word markup keeps whitespace, punctuation, Unicode and contractions intact", () => {
  const source = "Café, don't stop!\n\n你好 123. I'm ready.";
  const tree = { type: "root", children: [element("p", [text(source)])] };
  rehypeSpeechWords()(tree);
  assert.equal(visible(tree), source);
  assert.deepEqual(words(tree), ["Café", "don't", "stop", "你好", "123", "I'm", "ready"]);
});

test("speech spans retain emphasis, links, lists and table cells", () => {
  const strong = element("strong", [text("bold word")]);
  const link = element("a", [text("click here")], { href: "https://example.com" });
  const tree = { type: "root", children: [element("p", [strong, text(" "), link]), element("li", [text("item")]), element("td", [text("cell")])] };
  rehypeSpeechWords()(tree);
  assert.deepEqual(words(tree), ["bold", "word", "click", "here", "item", "cell"]);
  assert.equal(strong.tagName, "strong");
  assert.equal(link.properties.href, "https://example.com");
});

test("code renderers, math, hidden text and interactive media keep their original trees", () => {
  const skipped = ["pre", "code", "button", "svg", "math", "audio", "video", "script", "style", "textarea"].map((tag) => element(tag, [text("leave unchanged")]));
  skipped.push(element("span", [text("equation")], { className: ["katex"] }), element("span", [text("hidden")], { ariaHidden: "true" }));
  const before = structuredClone(skipped);
  const tree = { type: "root", children: [...skipped, element("p", [text("visible")])] };
  rehypeSpeechWords()(tree);
  assert.deepEqual(tree.children.slice(0, skipped.length), before);
  assert.deepEqual(words(tree), ["visible"]);
});

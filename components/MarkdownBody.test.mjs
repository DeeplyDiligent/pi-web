import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MarkdownBody } = await jiti.import("./MarkdownBody.tsx");
const { normalizeDisplayMath, markdownPreviewRemarkPlugins, markdownPreviewRehypePlugins } = await jiti.import("../lib/markdown.ts");
const { default: ReactMarkdown } = await jiti.import("react-markdown");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderMarkdown(markdown, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MarkdownBody, {
        cwd: "/home/me/project",
        onOpenFile() {},
        ...props,
      }, markdown),
    ),
  );
}

test("opens non-file markdown links in a safe new tab", () => {
  const html = renderMarkdown("[docs](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>docs<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("keeps local file markdown links in the app", () => {
  const relativeHtml = renderMarkdown("[file](components/MarkdownBody.tsx)");
  const fileUrlHtml = renderMarkdown("[report](file:///home/me/project/report.html)");

  assert.match(relativeHtml, /<a href="components\/MarkdownBody\.tsx">file<\/a>/);
  assert.doesNotMatch(relativeHtml, /target=|rel=|\snode=/);
  assert.match(fileUrlHtml, /<a href="file:\/\/\/home\/me\/project\/report\.html">report<\/a>/);
  assert.doesNotMatch(fileUrlHtml, /target=|rel=|\snode=/);
});

test("keeps file URLs inert without an in-app file handler", () => {
  const html = renderMarkdown("[report](file:///home/me/project/report.html)", { onOpenFile: undefined });

  assert.match(html, /<a href="" target="_blank" rel="noopener noreferrer">report<\/a>/);
});

test("keeps single-tilde CJK numeric ranges literal instead of striking them", () => {
  const html = renderMarkdown("5~7U 保证金 × 100~200倍杠杆");

  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /5~7U/);
  assert.match(html, /100~200倍/);
});

test("still renders double-tilde strikethrough", () => {
  const html = renderMarkdown("~~gone~~");

  assert.match(html, /<del>gone<\/del>/);
});

test("keeps financial amounts and surrounding bold prose out of LaTeX", () => {
  const html = renderMarkdown(`### The trade-off

The new $7.50m plan again uses almost all available capacity: its minimum margin above the protected reserve is only **$2,520**.

The less-aggressive option—**pause travel but retain the previous investment schedule**—has about **$54,477 minimum reserve headroom**, lower final debt, and passes the +1-point rate test.

Resuming travel means roughly **$49,955 of travel spending**, leaving only **$3,110 surplus before investment returns**.

| Scenario | Net worth |
|---|---:|
| Previous best | **$6.42m** |
| Reoptimise | **$7.50m** |`);
  assert.doesNotMatch(html, /katex|math-inline|math-display/);
  assert.match(html, /The new \$7\.50m plan again uses almost all available capacity/);
  assert.match(html, /<strong>\$2,520<\/strong>/);
  assert.match(html, /<strong>\$54,477 minimum reserve headroom<\/strong>/);
  assert.match(html, /<td[^>]*><strong>\$7\.50m<\/strong><\/td>/);
});

test("currency ranges, inline code, links and streaming partial amounts stay literal", () => {
  for (const markdown of [
    "$100 to $200, $350k or $7.50m.",
    "Budget $5–$10; AUD$12.50 and US$20.",
    "Keep `$HOME` and pay $5 for **$10 value**.",
    "[Budget $5](https://example.com/$5) and **$10**.",
    "The new $7.50m plan has only **$2,",
    "Cost $7.50m\nwith only **$2,520** remaining.",
  ]) {
    assert.doesNotMatch(renderMarkdown(markdown), /katex/);
  }
});

test("preserves intentional inline and display equations alongside currency", () => {
  const html = renderMarkdown(String.raw`Budget $100 to $200; calculate $x^2 + y^2 = z^2$ and $2x + 1$.

The $7.50m plan uses **$x$** as a variable.

Also \( 2x + 1 \).

$$E = mc^2$$`);
  assert.match(html, /Budget \$100 to \$200/);
  assert.match(html, /The \$7\.50m plan uses/);
  assert.equal((html.match(/class="katex"/g) ?? []).length, 5);
  assert.match(html, /class="katex-display"/);
});

test("file previews use the same currency-safe math parser", () => {
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: markdownPreviewRemarkPlugins,
    rehypePlugins: markdownPreviewRehypePlugins,
  }, "The $7.50m plan leaves **$2,520**. Use $2 sin(x)$ or $2xy$ in equations."));
  assert.match(html, /The \$7\.50m plan leaves <strong>\$2,520<\/strong>/);
  assert.equal((html.match(/class="katex"/g) ?? []).length, 2);
});

test("does not interpret currency inside code or escaped dollars as math", () => {
  const html = renderMarkdown("`$5 and $10`\n\n```text\n$5 and $10\n```\n\n\\$5 and \\$10");
  assert.doesNotMatch(html, /katex/);
  assert.match(html, /\$5 and \$10/);
});

test("renders backslash-escaped backticks inside inline code", () => {
  const html = renderMarkdown("`AudioManager\\`1.cs`");

  assert.match(html, /<code[^>]*>AudioManager`1\.cs<\/code>/);
  assert.doesNotMatch(html, /<\/code>1\.cs`/);
});

test("renders LaTeX parenthesis delimiters as inline math", () => {
  const html = renderMarkdown(String.raw`射线为 \(r_c = K^{-1}p\)。`);

  assert.match(html, /class="katex"/);
  assert.match(html, /r_c/);
});

test("renders paired LaTeX bracket delimiters as display math", () => {
  const html = renderMarkdown(String.raw`\[
P(\lambda)=o_b+\lambda r_b
\]`);
  const oneLineHtml = renderMarkdown(String.raw`\[P(\lambda)=o_b+\lambda r_b\]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /lambda/);
  assert.match(oneLineHtml, /class="katex-display"/);
});

test("renders model-emitted bracket-only formula lines as display math", () => {
  const html = renderMarkdown(String.raw`平均一致性：

[ C(x) = \frac{2}{T(T-1)} \sum_{i<j} S(\hat{y}^{(i)}, \hat{y}^{(j)}) ]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /\\sum/);
});

test("leaves an unmatched LaTeX bracket delimiter unchanged", () => {
  const markdown = String.raw`before
\[
x + y
after`;

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside Markdown code", () => {
  const markdown = "    \\(indented\\)\n\n`code\n\\(inline\\)`\n\n```text\n\\[\nfenced\n\\]\n```";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside raw HTML code", () => {
  const markdown = "<code>\\(inline\\)</code>\n\n<pre>\n\\(block\\)\n</pre>";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize escaped delimiters or link destinations", () => {
  const escaped = String.raw`Literal: \\(x+y\\).`;
  const link = String.raw`[docs](https://example.com/\(manual\))`;

  assert.equal(normalizeDisplayMath(escaped), escaped);
  assert.equal(normalizeDisplayMath(link), link);
});

test("previews completed Mermaid diagrams by default", () => {
  const html = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```");

  assert.match(html, /mermaid-block-loading/);
  assert.match(html, />Source</);
  assert.doesNotMatch(html, /A --&gt; B/);
});

test("keeps Mermaid source visible while the response is streaming", () => {
  const html = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```", { isStreaming: true });

  assert.doesNotMatch(html, /mermaid-block-loading/);
  assert.match(html, />Preview</);
  assert.match(html, /A --&gt; B/);
});

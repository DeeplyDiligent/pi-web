import remarkMath from "remark-math";
import type { Construct, Tokenizer } from "micromark-util-types";
import type { Processor } from "unified";
// Load the parser/math type augmentations without adding runtime dependencies.
import type {} from "remark-parse";
import type {} from "micromark-extension-math";

/** Tight single-dollar delimiters avoid pairing unrelated currency amounts.
 * Double dollars (including display math) retain remark-math's normal behavior.
 * Reject at tokenization time so Markdown emphasis inside currency prose is
 * parsed normally rather than trying to repair an already-rendered math node.
 */
export function remarkCurrencySafeMath(this: Processor): void {
  remarkMath.call(this);
  const extension = this.data().micromarkExtensions?.at(-1);
  const dollar = extension?.text?.[36];
  const constructs: Construct[] = dollar ? (Array.isArray(dollar) ? dollar : [dollar]) : [];
  for (const construct of constructs) {
    if (construct.name !== "mathText") continue;
    const original = construct.tokenize;
    const tokenize: Tokenizer = function (effects, ok, nok) {
      const start = this.events.length;
      return original.call(this, effects, (code) => {
        const token = this.events[start]?.[1];
        if (token?.type === "mathText") {
          const raw = this.sliceSerialize(token);
          if (!raw.startsWith("$$")) {
            const content = raw.slice(1, -1);
            const closesBeforeAmount = code !== null && code >= 48 && code <= 57;
            const looseDelimiter = /^\s|\s$/.test(content);
            // "$7.50m plan ... **$x$**" must not swallow the prose before x.
            // Numeric equations and explicit LaTeX commands remain supported.
            const numericProse = /^[-+]?\d/.test(content)
              && (/\s[A-Za-z]{2,}\s+[A-Za-z]{2,}\b/.test(content) || /\*\*|__/.test(content))
              && !/\\[A-Za-z]+/.test(content);
            if (closesBeforeAmount || looseDelimiter || numericProse) return nok(code);
          }
        }
        return ok(code);
      }, nok);
    };
    construct.tokenize = tokenize;
  }
}

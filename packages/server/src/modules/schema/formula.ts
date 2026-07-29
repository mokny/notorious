/**
 * Minimal, safe arithmetic expression evaluator for "formula" properties.
 * Deliberately NOT a general scripting language and never uses eval()/Function():
 * expressions are workspace-user-supplied strings, so we hand-roll a small
 * tokenizer + recursive-descent parser that only understands numbers,
 * `{property_key}` references, `+ - * /`, parentheses, unary minus, and a
 * handful of named functions (round, abs, min, max).
 */

type Token =
  | { kind: "number"; value: number }
  | { kind: "ref"; key: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" | "," }
  | { kind: "func"; name: string };

const FUNCTIONS = new Set(["round", "abs", "min", "max"]);

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const char = expression[i]!;

    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if ("+-*/(),".includes(char)) {
      tokens.push({ kind: "op", value: char as "+" | "-" | "*" | "/" | "(" | ")" | "," });
      i++;
      continue;
    }
    if (char === "{") {
      const end = expression.indexOf("}", i);
      if (end === -1) throw new Error("Unterminated property reference in formula");
      tokens.push({ kind: "ref", key: expression.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let j = i;
      while (j < expression.length && /[0-9.]/.test(expression[j]!)) j++;
      tokens.push({ kind: "number", value: Number(expression.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let j = i;
      while (j < expression.length && /[a-zA-Z0-9_]/.test(expression[j]!)) j++;
      const name = expression.slice(i, j).toLowerCase();
      if (!FUNCTIONS.has(name)) throw new Error(`Unknown function "${name}" in formula`);
      tokens.push({ kind: "func", name });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character "${char}" in formula`);
  }

  return tokens;
}

class Parser {
  private position = 0;

  constructor(
    private tokens: Token[],
    private resolveRef: (key: string) => number,
  ) {}

  parse(): number {
    const value = this.parseExpression();
    if (this.position !== this.tokens.length) throw new Error("Unexpected trailing tokens in formula");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        this.position++;
        const rhs = this.parseTerm();
        value = token.value === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "op" && (token.value === "*" || token.value === "/")) {
        this.position++;
        const rhs = this.parseUnary();
        value = token.value === "*" ? value * rhs : value / rhs;
      } else {
        return value;
      }
    }
  }

  private parseUnary(): number {
    const token = this.peek();
    if (token?.kind === "op" && token.value === "-") {
      this.position++;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of formula");

    if (token.kind === "number") {
      this.position++;
      return token.value;
    }
    if (token.kind === "ref") {
      this.position++;
      return this.resolveRef(token.key);
    }
    if (token.kind === "op" && token.value === "(") {
      this.position++;
      const value = this.parseExpression();
      this.expectOp(")");
      return value;
    }
    if (token.kind === "func") {
      this.position++;
      this.expectOp("(");
      const args = [this.parseExpression()];
      while (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === ",") {
        this.position++;
        args.push(this.parseExpression());
      }
      this.expectOp(")");
      return this.applyFunction(token.name, args);
    }
    throw new Error("Invalid formula syntax");
  }

  private expectOp(value: string): void {
    const token = this.peek();
    if (token?.kind !== "op" || token.value !== value) {
      throw new Error(`Expected "${value}" in formula`);
    }
    this.position++;
  }

  private applyFunction(name: string, args: number[]): number {
    switch (name) {
      case "round":
        return Math.round(args[0] ?? 0);
      case "abs":
        return Math.abs(args[0] ?? 0);
      case "min":
        return Math.min(...args);
      case "max":
        return Math.max(...args);
      default:
        throw new Error(`Unknown function "${name}"`);
    }
  }
}

/**
 * Evaluates a formula expression given a resolver for `{property_key}` references.
 * Returns 0 if the expression is malformed, so a bad formula never breaks the
 * object list/detail response for other properties.
 */
export function evaluateFormula(expression: string, resolveRef: (key: string) => number): number {
  try {
    const tokens = tokenize(expression);
    return new Parser(tokens, resolveRef).parse();
  } catch {
    return 0;
  }
}

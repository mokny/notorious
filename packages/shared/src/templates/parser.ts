import { TemplateSyntaxError, tokenize, type Token } from "./lexer.js";

export type Expr =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "list"; items: Expr[] }
  | { kind: "identifier"; name: string }
  | { kind: "member"; target: Expr; property: Expr; computed: boolean }
  | { kind: "unary"; op: "-" | "not"; argument: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "logical"; op: "and" | "or"; left: Expr; right: Expr }
  | { kind: "filter"; target: Expr; name: string; args: Expr[] }
  | { kind: "objectsQuery"; filters: ObjectsQueryFilter[] };

/** One `name="value"` pair inside `objects.where(...)` - always a literal string, both name and value, so the whole set of possible queries a given render pass will run can be known statically (see collectTemplateReferences in renderer.ts) without evaluating any expressions. */
export interface ObjectsQueryFilter {
  name: string;
  value: string;
}

/** Canonical, order-independent key for one `objects.where(...)` call's filter set - used to dedupe identical calls (so each distinct query runs once per render pass) and to look its precomputed result back up from `evalExpr`'s `objectsQuery` case. */
export function canonicalObjectsQueryKey(filters: ObjectsQueryFilter[]): string {
  return filters
    .map((f) => `${f.name}=${f.value}`)
    .sort()
    .join("&");
}

export type TemplateNode =
  | { kind: "text"; value: string }
  | { kind: "output"; expr: Expr }
  | { kind: "set"; name: string; expr: Expr }
  | { kind: "if"; branches: { cond: Expr | null; body: TemplateNode[] }[] }
  | { kind: "for"; varName: string; iterable: Expr; body: TemplateNode[] };

// ---- Expression tokenizer ----

type ExprToken = { type: "num"; value: number } | { type: "str"; value: string } | { type: "ident"; value: string } | { type: "punct"; value: string };

const PUNCT_MULTI = ["==", "!=", "<=", ">="];
const PUNCT_SINGLE = new Set([".", "[", "]", "(", ")", ",", "|", "+", "-", "*", "/", "%", "<", ">", "=", "~"]);

function tokenizeExpr(source: string): ExprToken[] {
  const tokens: ExprToken[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== quote) {
        if (source[j] === "\\" && j + 1 < source.length) {
          value += source[j + 1];
          j += 2;
        } else {
          value += source[j];
          j++;
        }
      }
      if (j >= source.length) throw new TemplateSyntaxError("Unterminated string literal");
      tokens.push({ type: "str", value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j]!)) j++;
      tokens.push({ type: "num", value: Number(source.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j]!)) j++;
      tokens.push({ type: "ident", value: source.slice(i, j) });
      i = j;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (PUNCT_MULTI.includes(two)) {
      tokens.push({ type: "punct", value: two });
      i += 2;
      continue;
    }
    if (PUNCT_SINGLE.has(c)) {
      tokens.push({ type: "punct", value: c });
      i++;
      continue;
    }
    throw new TemplateSyntaxError(`Unexpected character "${c}" in expression`);
  }
  return tokens;
}

const COMPARISON_OPS = new Set(["==", "!=", "<", "<=", ">", ">="]);

/** Hand-written recursive-descent expression parser - see this module's own README-style comment in renderer.ts for why this exists instead of a general-purpose eval-based approach. Grammar (loosest to tightest): or/and/not, comparison/in, ~ (concat), + -, * / %, filters (|), unary -, postfix ./[], primary. */
class ExprParser {
  private pos = 0;
  constructor(private tokens: ExprToken[]) {}

  private peek(): ExprToken | undefined {
    return this.tokens[this.pos];
  }
  private next(): ExprToken {
    const t = this.tokens[this.pos];
    if (!t) throw new TemplateSyntaxError("Unexpected end of expression");
    this.pos++;
    return t;
  }
  private atPunct(v: string): boolean {
    const t = this.peek();
    return Boolean(t && t.type === "punct" && t.value === v);
  }
  private atIdent(v: string): boolean {
    const t = this.peek();
    return Boolean(t && t.type === "ident" && t.value === v);
  }
  private expectPunct(v: string): void {
    if (!this.atPunct(v)) throw new TemplateSyntaxError(`Expected "${v}"`);
    this.pos++;
  }

  parseExpression(): Expr {
    const e = this.parseOr();
    if (this.pos < this.tokens.length) throw new TemplateSyntaxError("Unexpected token in expression");
    return e;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.atIdent("or")) {
      this.pos++;
      left = { kind: "logical", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.atIdent("and")) {
      this.pos++;
      left = { kind: "logical", op: "and", left, right: this.parseNot() };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.atIdent("not")) {
      this.pos++;
      return { kind: "unary", op: "not", argument: this.parseNot() };
    }
    return this.parseComparison();
  }
  private parseComparison(): Expr {
    let left = this.parseConcat();
    const t = this.peek();
    if (t && t.type === "punct" && COMPARISON_OPS.has(t.value)) {
      const op = this.next() as ExprToken & { type: "punct" };
      left = { kind: "binary", op: op.value, left, right: this.parseConcat() };
    } else if (this.atIdent("in")) {
      this.pos++;
      left = { kind: "binary", op: "in", left, right: this.parseConcat() };
    }
    return left;
  }
  private parseConcat(): Expr {
    let left = this.parseAdditive();
    while (this.atPunct("~")) {
      this.pos++;
      left = { kind: "binary", op: "~", left, right: this.parseAdditive() };
    }
    return left;
  }
  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.atPunct("+") || this.atPunct("-")) {
      const op = this.next() as ExprToken & { type: "punct" };
      left = { kind: "binary", op: op.value, left, right: this.parseMultiplicative() };
    }
    return left;
  }
  private parseMultiplicative(): Expr {
    let left = this.parseFilter();
    while (this.atPunct("*") || this.atPunct("/") || this.atPunct("%")) {
      const op = this.next() as ExprToken & { type: "punct" };
      left = { kind: "binary", op: op.value, left, right: this.parseFilter() };
    }
    return left;
  }
  private parseFilter(): Expr {
    let target = this.parseUnary();
    while (this.atPunct("|")) {
      this.pos++;
      const nameTok = this.next();
      if (nameTok.type !== "ident") throw new TemplateSyntaxError("Expected a filter name after |");
      const args: Expr[] = [];
      if (this.atPunct("(")) {
        this.pos++;
        if (!this.atPunct(")")) {
          args.push(this.parseOr());
          while (this.atPunct(",")) {
            this.pos++;
            args.push(this.parseOr());
          }
        }
        this.expectPunct(")");
      }
      target = { kind: "filter", target, name: nameTok.value, args };
    }
    return target;
  }
  private parseUnary(): Expr {
    if (this.atPunct("-")) {
      this.pos++;
      return { kind: "unary", op: "-", argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let target = this.parsePrimary();
    for (;;) {
      if (this.atPunct(".")) {
        this.pos++;
        const nameTok = this.next();
        if (nameTok.type !== "ident") throw new TemplateSyntaxError("Expected a property name after .");
        // `objects.where(...)` is the one hard-coded call form the grammar allows - a fixed-shape
        // query descriptor, not a general "call this arbitrary value" node (see interpreter.ts's
        // safeGet doc comment on why that distinction matters for security). Any other `(` after a
        // member access is a syntax error, not a real function call.
        if (nameTok.value === "where" && target.kind === "identifier" && target.name === "objects" && this.atPunct("(")) {
          target = this.parseObjectsWhereCall();
        } else {
          target = { kind: "member", target, property: { kind: "literal", value: nameTok.value }, computed: false };
        }
      } else if (this.atPunct("[")) {
        this.pos++;
        const prop = this.parseOr();
        this.expectPunct("]");
        target = { kind: "member", target, property: prop, computed: true };
      } else {
        break;
      }
    }
    return target;
  }
  /** Parses the `(name="value", ...)` arg list of `objects.where(...)` - the `(` has already been peeked, not consumed. */
  private parseObjectsWhereCall(): Expr {
    this.pos++; // consume "("
    const filters: ObjectsQueryFilter[] = [];
    if (!this.atPunct(")")) {
      filters.push(this.parseObjectsWhereFilterArg());
      while (this.atPunct(",")) {
        this.pos++;
        filters.push(this.parseObjectsWhereFilterArg());
      }
    }
    this.expectPunct(")");
    return { kind: "objectsQuery", filters };
  }
  private parseObjectsWhereFilterArg(): ObjectsQueryFilter {
    const nameTok = this.next();
    if (nameTok.type !== "ident") throw new TemplateSyntaxError('Expected a property name in objects.where(...), e.g. status="open"');
    this.expectPunct("=");
    const valueTok = this.next();
    if (valueTok.type !== "str") {
      throw new TemplateSyntaxError(`objects.where(...) values must be string literals - got a non-string value for "${nameTok.value}"`);
    }
    return { name: nameTok.value, value: valueTok.value };
  }
  private parsePrimary(): Expr {
    const t = this.next();
    if (t.type === "num") return { kind: "literal", value: t.value };
    if (t.type === "str") return { kind: "literal", value: t.value };
    if (t.type === "punct" && t.value === "(") {
      const e = this.parseOr();
      this.expectPunct(")");
      return e;
    }
    if (t.type === "punct" && t.value === "[") {
      const items: Expr[] = [];
      if (!this.atPunct("]")) {
        items.push(this.parseOr());
        while (this.atPunct(",")) {
          this.pos++;
          items.push(this.parseOr());
        }
      }
      this.expectPunct("]");
      return { kind: "list", items };
    }
    if (t.type === "ident") {
      if (t.value === "true") return { kind: "literal", value: true };
      if (t.value === "false") return { kind: "literal", value: false };
      if (t.value === "none" || t.value === "null") return { kind: "literal", value: null };
      return { kind: "identifier", name: t.value };
    }
    throw new TemplateSyntaxError("Unexpected token in expression");
  }
}

function parseExprSource(source: string): Expr {
  return new ExprParser(tokenizeExpr(source)).parseExpression();
}

// ---- Statement/template structure parser ----

interface Cursor {
  pos: number;
}

function firstWordOf(stmt: string): string {
  return stmt.split(/\s+/, 1)[0] ?? "";
}

function parseNodes(tokens: Token[], cursor: Cursor, stopKeywords: string[]): TemplateNode[] {
  const nodes: TemplateNode[] = [];
  while (cursor.pos < tokens.length) {
    const tok = tokens[cursor.pos]!;
    if (tok.kind === "text") {
      nodes.push({ kind: "text", value: tok.value });
      cursor.pos++;
      continue;
    }
    if (tok.kind === "expr") {
      nodes.push({ kind: "output", expr: parseExprSource(tok.value) });
      cursor.pos++;
      continue;
    }

    const word = firstWordOf(tok.value);
    if (stopKeywords.includes(word)) return nodes;

    if (word === "set") {
      const rest = tok.value.slice(3).trim();
      const eq = rest.indexOf("=");
      if (eq === -1) throw new TemplateSyntaxError('Expected "=" in a set statement');
      const name = rest.slice(0, eq).trim();
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new TemplateSyntaxError(`Invalid variable name "${name}"`);
      nodes.push({ kind: "set", name, expr: parseExprSource(rest.slice(eq + 1)) });
      cursor.pos++;
      continue;
    }

    if (word === "if") {
      const branches: { cond: Expr | null; body: TemplateNode[] }[] = [];
      let condSource = tok.value.slice(2).trim();
      cursor.pos++;
      let done = false;
      while (!done) {
        const body = parseNodes(tokens, cursor, ["elif", "else", "endif"]);
        branches.push({ cond: parseExprSource(condSource), body });
        const stopTok = tokens[cursor.pos];
        if (!stopTok || stopTok.kind !== "stmt") throw new TemplateSyntaxError('Missing "{% endif %}"');
        const stopWord = firstWordOf(stopTok.value);
        cursor.pos++;
        if (stopWord === "elif") {
          condSource = stopTok.value.slice(4).trim();
          continue;
        }
        if (stopWord === "else") {
          const elseBody = parseNodes(tokens, cursor, ["endif"]);
          branches.push({ cond: null, body: elseBody });
          const endTok = tokens[cursor.pos];
          if (!endTok || endTok.kind !== "stmt" || firstWordOf(endTok.value) !== "endif") {
            throw new TemplateSyntaxError('Missing "{% endif %}"');
          }
          cursor.pos++;
        }
        done = true;
      }
      nodes.push({ kind: "if", branches });
      continue;
    }

    if (word === "for") {
      const rest = tok.value.slice(3).trim();
      const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.+)$/.exec(rest);
      if (!match) throw new TemplateSyntaxError('Expected "for NAME in EXPR"');
      const varName = match[1]!;
      const iterable = parseExprSource(match[2]!);
      cursor.pos++;
      const body = parseNodes(tokens, cursor, ["endfor"]);
      const endTok = tokens[cursor.pos];
      if (!endTok || endTok.kind !== "stmt" || firstWordOf(endTok.value) !== "endfor") {
        throw new TemplateSyntaxError('Missing "{% endfor %}"');
      }
      cursor.pos++;
      nodes.push({ kind: "for", varName, iterable, body });
      continue;
    }

    throw new TemplateSyntaxError(`Unknown statement "${word}"`);
  }
  return nodes;
}

export function parseTemplate(source: string): TemplateNode[] {
  const tokens = tokenize(source);
  const cursor: Cursor = { pos: 0 };
  const nodes = parseNodes(tokens, cursor, []);
  if (cursor.pos < tokens.length) {
    const leftover = tokens[cursor.pos]!;
    throw new TemplateSyntaxError(`Unexpected "{% ${leftover.kind === "stmt" ? leftover.value : ""} %}"`);
  }
  return nodes;
}

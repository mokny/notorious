# Object scripting

Every object can have its own server-side script - real JavaScript that reads and writes that
object's properties and blocks. Use it for calculations (sum a table column), derived text (days
until a deadline), rollup-style aggregation across relations, or generated content (a Mermaid
diagram built from a table). The **Script** section lives at the bottom of an object's page,
collapsed by default, and is only visible to workspace members with editor role or higher - never
to anonymous share-link visitors, even ones with an editor-role link.

## Running a script

- **Run button** - executes the currently saved script once, immediately. Use this while writing
  and testing a script; it always works, regardless of the automation toggle below.
- **Automation** - if the script's first line is exactly `// @automation`, it also runs
  automatically (debounced ~800ms) whenever this object's own properties or blocks change, as long
  as the **"Automation enabled"** checkbox next to Run is on. That checkbox is a kill-switch
  specifically for the automatic trigger - it doesn't affect the Run button.

Either way, the result (success/failure, any `object.log(...)` output, timestamp, duration) is
shown below the editor and persists until the next run.

## The `object` API

Everything a script sees is a snapshot taken right before it runs - reads never hit the database
mid-script, and relation lookups are one level deep, resolved at the start of the run.

| | |
| --- | --- |
| `object.id`, `object.typeKey`, `object.title`, `object.createdAt`, `object.updatedAt` | Read-only identity/metadata |
| `object.properties` | `{ [propertyKey]: value }` - fully resolved, including computed Formula/Rollup properties |
| `object.setProperty(key, value)` | Stages a property write. `value` must be a string, number, boolean, array of strings, or `null` - anything else throws. Unknown property keys (not defined on this object's type) are silently ignored, same as a normal property edit in the UI |
| `object.blocks` | `[{ id, type, content, position }]` - every top-level block on this object, in document order |
| `object.setBlockContent(blockId, content)` | Stages a partial content update for an existing block (merged the same way a normal block edit is) |
| `object.appendBlock(type, content)` | Stages a brand-new block at the end of the document. `type` must be a real block type (`paragraph`, `heading`, `table`, `callout`, `mermaid`, ...) |
| `object.relatedObjects(propertyKey)` | `[{ id, title, properties }]` for every object currently linked through that Relation property - a snapshot, not live |
| `object.log(...args)` | Appends to the run's log, shown in the result panel |
| `object.now()` | Current time as an ISO timestamp - use this instead of `new Date()`, which has no real timezone data inside the sandbox |
| `object.automation.isAutomated` | `true` when this run was triggered by the automation, `false` for a manual Run click |
| `variables.<Name>` | The computed value of the workspace's `Variable` object named `<Name>` - read-only, coerced to its declared value type (int/float/string/bool/date/list/json). See "Variable objects" below |

Writes are **staged, not applied immediately** - `setProperty`/`setBlockContent`/`appendBlock` only
take effect if the script finishes without throwing. A script that errors or times out changes
nothing.

`Math`, `JSON`, arrays, and ordinary JavaScript control flow (loops, functions, closures) all work
normally - there's no restricted dialect beyond the missing globals below.

## Examples

**Sum a table column, append the total**

```js
const table = object.blocks.find((b) => b.type === "table");
const total = table.content.rows.reduce((sum, row) => sum + (Number(row[0]) || 0), 0);
object.appendBlock("callout", { markdown: `**Total: ${total}**`, icon: "🧮" });
```

**Same, but updates the total in place instead of appending a new callout every run** - the only
way to find "the same" block again across runs is to recognize it by its content, so this looks
for a callout whose text already starts with `**Total:` and edits that one if it's there.
`// @automation` makes this actually useful: the total stays current on its own as the table
changes, instead of growing a new callout underneath it on every run.

```js
// @automation
const table = object.blocks.find((b) => b.type === "table");
const total = table.content.rows.reduce((sum, row) => sum + (Number(row[0]) || 0), 0);
const markdown = `**Total: ${total}**`;
const existing = object.blocks.find((b) => b.type === "callout" && b.content.markdown?.startsWith("**Total:"));
if (existing) object.setBlockContent(existing.id, { ...existing.content, markdown });
else object.appendBlock("callout", { markdown, icon: "🧮" });
```

**Days until a deadline, written to a text property**

```js
const deadline = Date.parse(object.properties.deadline);
const days = Math.ceil((deadline - Date.parse(object.now())) / 86_400_000);
object.setProperty("days_remaining", days >= 0 ? `${days} days left` : `${-days} days overdue`);
```

**Flexible rollup over a relation** (more expressive than the built-in Rollup property, since it's
arbitrary JS rather than one of a fixed set of aggregation functions)

```js
const tasks = object.relatedObjects("tasks");
const openHours = tasks
  .filter((t) => t.properties.status !== "done")
  .reduce((sum, t) => sum + (Number(t.properties.estimate_hours) || 0), 0);
object.setProperty("remaining_hours", openHours);
```

**Auto-check checklist items, summarize progress** (`// @automation` - keeps the summary live as
items get checked)

```js
// @automation
const checklist = object.blocks.find((b) => b.type === "checklist");
if (checklist) {
  const done = checklist.content.items.filter((i) => i.checked).length;
  const total = checklist.content.items.length;
  const summary = object.blocks.find((b) => b.type === "toggle" && b.content.summaryMarkdown?.startsWith("Progress:"));
  const markdown = `Progress: ${done}/${total} complete`;
  if (summary) object.setBlockContent(summary.id, { ...summary.content, summaryMarkdown: markdown });
  else object.appendBlock("toggle", { summaryMarkdown: markdown });
}
```

**Generate a Mermaid diagram from table data**

```js
const table = object.blocks.find((b) => b.type === "table");
const lines = table.content.rows.map((row) => `  ${row[1]} : ${Number(row[0]) || 0}`);
object.appendBlock("mermaid", { code: `pie title Breakdown\n${lines.join("\n")}` });
```

## Variable objects

`Variable` is a system object type meant purely for scripting/templates - it can't be inserted as a
block in the editor (no "Existing Object" entry for it), but any object of any type can still link to
one via a Relation property. A Variable has two properties:

- **Value Type** - `int`, `float`, `string`, `bool`, `date`, `list`, or `json`.
- **Template** - an expression in the same format used for [block templates](TEMPLATES.md)
  (`{{ }}`/`{% %}`). Plain text with no template syntax is used as-is.

The rendered template output is coerced to the declared Value Type on every read; a value that
doesn't fit (e.g. Value Type `int` but the template renders `"abc"`) resolves to `null` with the
error shown on the Variable's own object page. A Variable's title is its lookup name and must be
unique per workspace. A Variable's own template can reference other Variables via `variables.<Name>`
too - a circular reference (A references B, B references A) resolves to an error instead of hanging.

## Security model

Scripts run inside [QuickJS](https://github.com/justjake/quickjs-emscripten) compiled to WebAssembly
- a completely separate JS engine with no access to Node's `require`, `process`, `fetch`, the
filesystem, or the network. The only way in or out is the `object` API above, which is bound as a
handful of explicit functions; nothing else is exposed. A fresh sandbox is created per run and
discarded afterward, so nothing carries over between executions.

| Limit | Value |
| --- | --- |
| Script source length | 20,000 characters |
| Execution timeout | 2 seconds (wall-clock, enforced even inside an infinite loop) |
| Memory | 16 MB |
| Stack size | 1 MB |
| Log output | 10,000 characters (truncated, doesn't fail the run) |
| Property writes per run | 50 |
| Block updates per run | 50 |
| Appended blocks per run | 20 |
| Related objects resolved per run | 200 total, across all relation properties |
| Automatic runs | 6 per minute per object, then automation auto-pauses with the reason shown in the result panel (re-enable the automation toggle to try again) |

That last limit exists because a script's own writes never re-trigger its own automation (that
would be an obvious infinite loop), but two *different* objects whose automations write back to
each other can't be caught that way - the per-object rate limit catches that case instead.

## Not (yet) supported

- Scheduled/cron-style triggers - automation only reacts to the object's own content changing.
- Triggering off changes to a *different* object.
- Importing or sharing a script between objects.
- Syntax highlighting or autocomplete in the script editor (it's a plain text area).

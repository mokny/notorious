# Templates

Paragraph, heading, quote, callout, toggle-summary, checklist and table text can contain template
code, in the same style as Home Assistant's templating: `{{ expr }}` computes an expression and
outputs the result, `{% stmt %}` runs logic without outputting anything itself (`set`, `if`, `for`),
and `{# comment #}` is stripped and never shown. Rendering happens inline, per field: while you're
typing in a field, you see and edit its raw `{{ }}`/`{% %}` source; the moment it loses focus, it
shows the rendered result instead - click back into it to see and edit the source again. A locked
object or a shared read-only page always shows the rendered result, since there's no editing to
switch back to.

```
{% set total = 0 %}
{% for row in blocks.prices.rows %}{% set total = total + (row[0] | int) %}{% endfor %}
**Total: {{ total }}**
```

## Editor support

Every field that can contain template code gets syntax highlighting (keywords, strings, numbers,
filter names, and delimiters colored distinctly) plus autocomplete while you type: `{{` suggests
`object`, `blocks`, `objects`, `variables` and known `Variable` names; a `.` after `object`/
`objects.<id>`/`objects.where(...)` suggests that shape's fields; a `|` suggests filter names. A
template that fails to parse gets a wavy red underline the moment you type it, with the real error
message on hover - the same parser the server uses to render, so there's no "looked fine while
typing, broke on save" gap. (Checklist items are the one exception for now - still plain text, no
highlighting/autocomplete there yet, though `{{ }}`/`{% %}` inside one still renders correctly.)

## Block and object ids

Every block and object gets a short, auto-generated id at creation (e.g. `paragraph_a1b2c3d4`,
or slugified from an object's title) - click the `{}` icon next to a block (in its hover toolbar)
or next to an object's title to rename it to something memorable. Ids only use lowercase letters,
numbers and `_`, and must be unique (per object for blocks, per workspace for objects). No hyphens:
`-` is the subtraction operator in template expressions, so `objects.my-task` would silently parse
as `objects.my - task` instead of addressing a single id - use `objects.my_task` instead.

## Available variables

| | |
| --- | --- |
| `object` | The current object: `object.title`, `object.slug`, `object.type_key`, `object.archived`, `object.locked`, and `object.properties.<key>` for every property value (Formula/Rollup included, already computed) |
| `blocks.<id>` | Another block in the *same* object, by its id - above **or below** the block doing the referencing - `.text` (its rendered text), plus for checklists `.items` (`[{text, checked}]`), `.checked_count`, `.total_count`; for tables `.columns`/`.rows`; and for voting blocks `.items` (`[{id, title, description, up, down, score, ratio}]`, `ratio` a 0-100 upvote percentage) and `.total_votes` - vote counts are always the live aggregate, never a specific viewer's own vote |
| `objects.<id>` | Another object *in this workspace*, by its id - same shape as `object` above, plus `objects.<id>.blocks.<blockId>` (same shape as `blocks.<id>` above) for one of *its* blocks. That object's blocks are exposed as raw (unrendered) text, not re-evaluated - see "How rendering works" below |
| `objects.where(type="...", ...)` | Every object of a given type in this workspace, optionally narrowed by property values - see "Querying every object of a type" below |
| `variables.<Name>` | The computed value of a `Variable` object named `<Name>` (see [SCRIPTING.md](SCRIPTING.md#variable-objects)) - already coerced to its declared value type, or `null` if it failed to resolve |

A `{% set %}` in one block is visible in every block *below* it in the same object (document
order) - so the table-total example above works whether it's typed as a single block or (as shown
in the Examples section) spread across the table and a paragraph below it. `{% set %}` inside a
`{% for %}` loop also reaches back and updates a same-named variable declared before the loop
(instead of Jinja's usual behavior of requiring a `namespace()` object for this) - that's what lets
`total = total + ...` actually accumulate across iterations.

`blocks.<id>` itself isn't limited to "above" the way `{% set %}` is - a summary near the top of an
object can read `blocks.prices.rows` even if the `prices` table is further down the document (see
"How rendering works" below for how).

## Querying every object of a type

`objects.<id>` is great when you already know exactly which object you want, but sometimes you want
"every Task with status open," not one specific object. `objects.where(...)` does that:

```
{% for task in objects.where(type="task", status="open") %}- {{ task.title }}
{% endfor %}
```

- `type="..."` is required - it's how the query knows which object type (and therefore which
  properties) it's even looking at. Everything else is optional and matches by exact equality
  (`status="open"` only matches an `open` status exactly - no `contains`/`>`/`<` yet).
- The property names on the right (`status`, in the example) are the property's *key*, the same
  short identifier used everywhere else in a template (`object.properties.<key>`), not its display
  name.
- Each matching object comes back in the same shape as an `objects.<id>` reference: `.title`,
  `.slug`, `.properties.<key>`, `.blocks.<blockId>`, etc. - built the same "raw, not re-evaluated"
  way, so a `where(...)` result can't reintroduce the reference cycles the `objects.<id>` design
  already rules out (see "How rendering works" below).
- Results are capped at 200 objects, and every object the query even *looks at* (to check whether
  you're allowed to see it, whether or not it ends up matching) counts against the same render
  budget as everything else in the template (see Security below) - a `where(...)` call over a huge
  workspace can't blow past that budget just by touching a lot of rows.
- Exactly like `objects.<id>`, every candidate object is checked against *your* actual permissions
  before it's included - one you can't see is silently skipped, not shown as an error.

```
{% set total = 0 %}
{% for expense in objects.where(type="expense", category="hosting") %}{% set total = total + (expense.properties.amount | int) %}{% endfor %}
Hosting spend so far: {{ total }} $
```

## Filters

`{{ value | filter }}` or `{{ value | filter(arg) }}`: `upper`, `lower`, `trim`, `ltrim`, `rtrim`,
`capitalize`, `title`, `length`, `wordcount`, `default(fallback)`, `round(digits)`, `abs`, `int`,
`float`, `string`, `first`, `last`, `join(sep)`, `sort`, `reverse`, `truncate(n)`,
`replace(search, replacement)`, `split(sep)` (splits on whitespace if `sep` is omitted),
`slice(start, end)`, `contains(needle)`, `startswith(prefix)`, `endswith(suffix)`,
`padstart(n, char)`, `padend(n, char)`, `repeat(n)`, `regex(pattern, flags)`,
`regexreplace(pattern, replacement, flags)`, `regexextract(pattern, flags)` (first capture group,
or the full match if the pattern has none). `regex`/`regexreplace`/`regexextract` cap both the
pattern and the input length and reject the classic catastrophic-backtracking shapes (e.g.
`(a+)+`) - a template can't hang the renderer with a hostile pattern.

## Examples

**Table total, spread across two blocks** (a table block with id `prices`, followed by a
paragraph below it - the same idea as the quick example at the top, just laid out the way you'd
actually type it when the table and the total are naturally two separate blocks; typing the whole
thing into one paragraph below the table, like the quick example does, works the same way)

Table block (id `prices`):

| Item | Cost |
| --- | --- |
| Hosting | 12 |
| Domain | 9 |

Paragraph block right below it:
```
{% set total = 0 %}
{% for row in blocks.prices.rows %}{% set total = total + (row[1] | int) %}{% endfor %}
**Total: {{ total }} $**
```

**Checklist progress, written into a paragraph below it** (checklist block with id `tasks`)
```
{{ blocks.tasks.checked_count }} / {{ blocks.tasks.total_count }} done
{% if blocks.tasks.checked_count == blocks.tasks.total_count %}🎉 All done!{% endif %}
```

**Voting results, written into a paragraph below it** (voting block with id `poll`)
```
{% for item in blocks.poll.items %}{{ item.title }}: {{ item.score }} ({{ item.ratio }}% upvoted, {{ item.up + item.down }} votes){% endfor %}
{{ blocks.poll.total_votes }} votes total
```

**Conditional text based on a property value**
```
{% if object.properties.status == "done" %}✅ Finished{% elif object.properties.status == "blocked" %}🚧 Blocked{% else %}⏳ In progress{% endif %}
```

**Pulling in another object's data** (a Project object with id `website_relaunch`, referenced
from a task that belongs to it)
```
Part of {{ objects.website_relaunch.title }} (owner: {{ objects.website_relaunch.properties.owner | default("unassigned") }})
```

**Pulling in a block from another object** (that same Project object has its own table block with
id `budget`)
```
Project budget: {{ objects.website_relaunch.blocks.budget.rows | length }} line items
```

**A summary reading a table that's further down the same document** (the `prices` table block is
typed in *below* this paragraph, not above it)
```
This page totals {% set total = 0 %}{% for row in blocks.prices.rows %}{% set total = total + (row[1] | int) %}{% endfor %}{{ total }} $ - see the table below for the breakdown.
```

**Filters, chained**
```
{{ object.title | trim | upper }}
{{ object.properties.tags | join(", ") }}
{{ object.properties.description | default("No description yet") | truncate(80) }}
```

**A comment left for whoever edits this next** - never shown, not even in the rendered result
```
{# TODO: once the "priority" property exists, sort this list by it instead #}
```

**Counting every object of a type, no loop needed** (the `length` filter works on the list
`objects.where(...)` returns, just like it works on any other list)
```
{{ objects.where(type="task", status="open") | length }} open tasks right now
```

**A open-tasks list on a Project object, filtered by a relation-style property** (assumes Task
objects have a `project` property holding the owning project's id)
```
{% for task in objects.where(type="task", project=object.id, status="open") %}- [ ] {{ task.title }}
{% endfor %}
```

**Combining a workspace-wide query with a per-block loop** (total hours logged across every open
Task, each one's own `hours` property)
```
{% set total_hours = 0 %}
{% for task in objects.where(type="task", status="open") %}{% set total_hours = total_hours + (task.properties.hours | default(0) | int) %}{% endfor %}
{{ total_hours }} hours logged on open tasks
```

## Outbound HTTP requests

`http.get(url)`, `http.post(url, body)`, `http.put(url, body)`, `http.patch(url, body)`,
`http.delete(url)`, `http.head(url)` fetch a URL from the server and give you back an object with
`.status`, `.ok`, `.body` (response text), and `.headers.<name>` (lowercase header names). Every
method except `get`/`delete`/`head` takes a `body` string as its second argument; all of them
optionally take a trailing headers argument, a literal list of `[name, value]` pairs:

```
{{ http.get("https://api.example.com/status", [["Authorization", "Bearer xyz"]]).body }}
{% set res = http.post("https://api.example.com/echo", "{\"hello\":true}", [["Content-Type", "application/json"]]) %}
Status: {{ res.status }}
```

- **Off by default.** An instance admin has to explicitly turn this on:
  `npm run enable-template-http` (or `npm run --workspace=packages/server set-allow-template-http --
  --status` to check, `--disable` to turn back off - see `docs/DEPLOYMENT.md`). While off, every
  `http.*(...)` call evaluates to a runtime error, same as any other template error.
- **Every argument must be a string literal** - `url`, `body`, and every header name/value. Just
  like `objects.where(...)`'s filter values, this is what lets the whole set of requests a render
  will make be known before any expression is evaluated (see "How rendering works" below), so a
  computed URL like `http.get(object.properties.api_url)` isn't currently supported.
- **Capped at 8 distinct calls per render** - identical calls (same method/URL/headers/body,
  regardless of how many times or where they appear across the object's blocks) only run once and
  share their result, the same deduping `objects.where(...)` gets.
- See Security below for what's actually guarded against once this is turned on.

## How rendering works

Every one of an object's blocks is rendered together, in two top-to-bottom passes. The first pass
computes every block's value without worrying about ordering - it exists purely to find out what
every block *will* render to, including ones further down the document. The second pass is the
real one: it starts with the first pass's results already available (so `blocks.<id>` can resolve
a block below the one referencing it), then re-derives each block's value in proper document
order, overwriting the first pass's rough answer with the correct one as it goes - so a block
referencing an *earlier* one (the original, common case, including `{% set %}`) still always sees
that earlier block's true final output, not the first pass's approximation.

A referenced *other* object (`objects.<id>`) is **not** itself recursively template-rendered - you
get its already-computed properties and raw block text (including its own `blocks.<id>` blocks),
not a second layer of template evaluation - which keeps a template in object A referencing object B
(which references A back) from becoming an infinite loop.

## Security

Templates run entirely server-side, through a small hand-written interpreter built specifically
for this - not a general-purpose scripting language and not `eval`. There's no way to call an
arbitrary function or reach `constructor`/`__proto__` - those aren't missing safety checks, the
language the parser accepts simply has no such thing as "call this value as a function" at all;
only a fixed table of filters (the list above) and two fixed call shapes, `objects.where(...)` and
`http.*(...)`, can ever be invoked, and neither exposes a live function reference to the template
itself. A render is capped by both a step budget and a wall-clock deadline, and any single
`{% for %}` loop is capped at 1000 iterations. Every object a template reads - the current one, a
cross-referenced `objects.<id>`, or a candidate row from `objects.where(...)` - is checked against
the actual permissions of whoever is viewing the page (a real workspace member's role, or exactly
what an anonymous share link grants) - a template can never surface data its viewer couldn't
already see through the normal UI. `objects.where(...)` adds two more caps on top of that,
independent of each other: a hard 200-row result limit, and one render budget step charged per
candidate row it checks (whether or not that row ends up matching or being visible to the viewer) -
so a query over a huge workspace can't buy unbounded work just by looking at a lot of rows before
filtering them down.

`http.*(...)` (see "Outbound HTTP requests" above) is the one deliberate exception to "no
filesystem/network/process access," off by default and opt-in per instance for exactly that reason.
Turning it on lets any workspace member who can edit a template field make the *server* issue an
outbound request every time *anyone* views that page - including an anonymous share-link visitor,
with no per-viewer confirmation - which is a real SSRF vector: someone with template-edit access
could otherwise use it to probe the server's own internal network or cloud metadata endpoint. Each
call is guarded by: http/https only, the target hostname's DNS-resolved address checked against
private/loopback/link-local/metadata IP ranges (re-checked on *every* redirect hop, not just the
first), an 8-second timeout, and a 1MB response cap - on top of the 8-distinct-calls-per-render cap
mentioned above. This isn't a complete defense (DNS-rebinding between the resolve check and the
actual connection isn't pinned) - treat it as appropriate for a self-hosted instance among trusted
workspace members, not as safe to expose to untrusted or public-signup workspaces without further
hardening.

Output is inserted as plain text into the same Markdown pipeline every block already uses (which
never interprets raw HTML) - rendering a template introduces no new risk beyond what any user
typing Markdown directly could already do.

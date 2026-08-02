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

## Block and object ids

Every block and object gets a short, auto-generated id at creation (e.g. `paragraph-a1b2c3d4`,
or slugified from an object's title) - click the `{}` icon next to a block (in its hover toolbar)
or next to an object's title to rename it to something memorable. Ids only use lowercase letters,
numbers, `-` and `_`, and must be unique (per object for blocks, per workspace for objects).

## Available variables

| | |
| --- | --- |
| `object` | The current object: `object.title`, `object.slug`, `object.type_key`, `object.archived`, `object.locked`, and `object.properties.<key>` for every property value (Formula/Rollup included, already computed) |
| `blocks.<id>` | Another block in the *same* object, by its id - above **or below** the block doing the referencing - `.text` (its rendered text), plus for checklists `.items` (`[{text, checked}]`), `.checked_count`, `.total_count`, and for tables `.columns`/`.rows` |
| `objects.<id>` | Another object *in this workspace*, by its id - same shape as `object` above, plus `objects.<id>.blocks.<blockId>` (same shape as `blocks.<id>` above) for one of *its* blocks. That object's blocks are exposed as raw (unrendered) text, not re-evaluated - see "How rendering works" below |

A `{% set %}` in one block is visible in every block *below* it in the same object (document
order) - so the table-total example above works whether it's typed as a single block or (as shown
in the Examples section) spread across the table and a paragraph below it. `{% set %}` inside a
`{% for %}` loop also reaches back and updates a same-named variable declared before the loop
(instead of Jinja's usual behavior of requiring a `namespace()` object for this) - that's what lets
`total = total + ...` actually accumulate across iterations.

`blocks.<id>` itself isn't limited to "above" the way `{% set %}` is - a summary near the top of an
object can read `blocks.prices.rows` even if the `prices` table is further down the document (see
"How rendering works" below for how).

## Filters

`{{ value | filter }}` or `{{ value | filter(arg) }}`: `upper`, `lower`, `trim`, `capitalize`,
`length`, `default(fallback)`, `round(digits)`, `abs`, `int`, `float`, `string`, `first`, `last`,
`join(sep)`, `sort`, `reverse`, `truncate(n)`.

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
arbitrary function, reach `constructor`/`__proto__`, or touch the filesystem/network/process -
those aren't missing safety checks, the language the parser accepts simply has no such thing as
"call this value as a function" at all; only a fixed table of filters (the list above) can ever be
invoked, by name. A render is capped by both a step budget and a wall-clock deadline, and any
single `{% for %}` loop is capped at 1000 iterations. Every object a template reads - the current
one or a cross-referenced `objects.<id>` - is checked against the actual permissions of whoever is
viewing the page (a real workspace member's role, or exactly what an anonymous share link grants) -
a template can never surface data its viewer couldn't already see through the normal UI.

Output is inserted as plain text into the same Markdown pipeline every block already uses (which
never interprets raw HTML) - rendering a template introduces no new risk beyond what any user
typing Markdown directly could already do.

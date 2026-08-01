# Templates

Paragraph, heading, quote, callout, toggle-summary, checklist and table text can contain template
code, in the same style as Home Assistant's templating: `{{ expr }}` computes an expression and
outputs the result, `{% stmt %}` runs logic without outputting anything itself (`set`, `if`, `for`),
and `{# comment #}` is stripped and never shown. The raw `{{ }}`/`{% %}` source is always what you
edit - click **Preview** (the eye icon next to Lock/Share at the top of an object) to see it
rendered instead, read-only.

```
{% set total = 0 %}
{% for row in table.rows %}{% set total = total + (row[0] | int) %}{% endfor %}
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
| `blocks.<id>` | Another block in the *same* object, by its id - `.text` (its rendered text), plus for checklists `.items` (`[{text, checked}]`), `.checked_count`, `.total_count`, and for tables `.columns`/`.rows` |
| `objects.<id>` | Another object *in this workspace*, by its id - same shape as `object` above, but its own blocks are exposed as raw (unrendered) text, not re-evaluated - see "How rendering works" below |

A `{% set %}` in one block is visible in every block *below* it in the same object (document
order) - that's what makes the table-total example above meaningful spread across two blocks
instead of needing to fit in one.

## Filters

`{{ value | filter }}` or `{{ value | filter(arg) }}`: `upper`, `lower`, `trim`, `capitalize`,
`length`, `default(fallback)`, `round(digits)`, `abs`, `int`, `float`, `string`, `first`, `last`,
`join(sep)`, `sort`, `reverse`, `truncate(n)`.

## How rendering works

Every one of an object's blocks is rendered together, in one pass, top to bottom - that's how
`{% set %}` in an earlier block reaches a later one, and how `blocks.<id>` always sees an earlier
block's *final* rendered text. A referenced *other* object (`objects.<id>`) is **not** itself
recursively template-rendered - you get its already-computed properties and raw block text, not a
second layer of template evaluation - which keeps a template in object A referencing object B
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
never interprets raw HTML) - previewing a template introduces no new risk beyond what any user
typing Markdown directly could already do.

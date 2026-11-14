# Toolkit: build spec

Build eight small JavaScript modules for a shared utility library. The modules are independent: none of them imports another.

## Ground rules
- Node 26, ES modules (`package.json` with `"type": "module"`), no dependencies.
- Each module is one file `src/<name>.js` with the named exports below, and has its own tests in `test/<name>.test.js`. `node --test` in this folder runs all of them and must pass.
- Unless a module says otherwise, invalid input throws an `Error` (any subclass).
- `README.md` documents every export with a short example.
- Quality matters as much as correctness: clear code, sensible error messages, and tests that cover the edge cases.

## 1. `src/csv.js`
- `parseCsv(text, options?)` returns an array of records, each an array of strings. `options.delimiter` defaults to `,`.
- Follows RFC 4180: a field may be wrapped in double quotes; inside a quoted field `""` is a literal quote and the delimiter, CR and LF are ordinary characters. Records end with LF or CRLF. A line ending at the very end of the text does not create an extra record. Unquoted fields are kept exactly as written (no trimming).
- The empty string gives `[]`. An empty line in the middle of the text gives a record with one empty field.
- A quoted field that is never closed throws.
- `toCsv(rows, options?)` is the reverse: records joined with `\n`, no line ending after the last one. A field is quoted only if it contains the delimiter, a double quote, CR or LF. `null` and `undefined` become empty fields; other values go through `String()`.

## 2. `src/semver.js`
- `parse(version)` returns `{major, minor, patch, prerelease, build}` for a valid Semantic Versioning 2.0.0 string, with `prerelease` an array whose numeric identifiers are numbers and the rest strings, and `build` an array of strings. Anything else throws (for example `1.2`, or a numeric part with a leading zero).
- `compare(a, b)` returns -1, 0 or 1 using SemVer 2.0.0 precedence (build metadata is ignored).
- `satisfies(version, range)` returns a boolean. A range is one or more sets separated by `||`; the version must satisfy at least one set. A set is one or more comparators separated by spaces; the version must satisfy all of them. Comparators:
  - `1.2.3` or `=1.2.3`, `>1.2.3`, `>=1.2.3`, `<1.2.3`, `<=1.2.3`
  - `^1.2.3` means `>=1.2.3 <2.0.0`; `^0.2.3` means `>=0.2.3 <0.3.0`; `^0.0.3` means `>=0.0.3 <0.0.4`
  - `~1.2.3` means `>=1.2.3 <1.3.0`; `~1.2` means `>=1.2.0 <1.3.0`
  - `*` matches everything; `1.x` or `1` means `>=1.0.0 <2.0.0`; `1.2.x` or `1.2` means `>=1.2.0 <1.3.0`

## 3. `src/cron.js`
- `nextRun(expression, from)` returns a `Date`: the first minute strictly after `from` (a `Date`) that matches a five-field cron expression `minute hour day-of-month month day-of-week`. Everything is in UTC. The result has zero seconds and milliseconds.
- Each field accepts `*`, a number, a list (`1,15,30`), a range (`9-17`) and steps (`*/15`, `10-40/10`). Allowed values: minute 0 to 59, hour 0 to 23, day of month 1 to 31, month 1 to 12, day of week 0 to 6 with 0 = Sunday.
- If both day-of-month and day-of-week are restricted (neither is `*`), a day matches when either of them matches. Otherwise all fields must match.
- An invalid expression throws.

## 4. `src/lru.js`
- `new LruCache({capacity, ttlMs, now})`: `capacity` is a positive integer (anything else throws); `ttlMs` is optional (no expiry when missing); `now` is an optional function returning the current time in milliseconds (default `Date.now`).
- `set(key, value)` adds or replaces an entry, makes it the most recently used and restarts its expiry clock. If the cache then holds more than `capacity` entries, the least recently used one is removed.
- `get(key)` returns the value or `undefined`, and makes the entry the most recently used. It does not restart the expiry clock.
- `has(key)` returns a boolean and does not change the order. `delete(key)` returns whether something was removed. `clear()` empties the cache.
- `size` (a getter) is the number of live entries. `keys()` returns the live keys from least to most recently used.
- An entry is expired once `ttlMs` milliseconds or more have passed since it was last set. Expired entries behave everywhere as if they were not there.

## 5. `src/diff.js`
- `diffLines(a, b)` compares two strings line by line (split on `\n`; the empty string has no lines) and returns an array of `{type, line}` with `type` one of `'equal'`, `'remove'`, `'add'`.
- The `equal` and `remove` entries, in order, are exactly the lines of `a`; the `equal` and `add` entries are exactly the lines of `b`.
- The result is minimal: the `equal` entries are a longest common subsequence of the two line lists. Where lines are replaced, the removals of a block come before its additions.
- `stats(diff)` returns `{added, removed, unchanged}` counts.

## 6. `src/template.js`
- `render(template, data)` returns a string.
- `{{path}}` inserts a value, HTML-escaped (`&` to `&amp;`, `<` to `&lt;`, `>` to `&gt;`, `"` to `&quot;`, `'` to `&#39;`). `{{{path}}}` inserts it unescaped. A path is a name or dotted names (`user.name`). Spaces inside the braces are allowed. `null`, `undefined` and missing values insert nothing; other values go through `String()`.
- `{{#if path}}...{{else}}...{{/if}}` (the else part is optional). `false`, `null`, `undefined`, `0`, `''` and empty arrays are falsy.
- `{{#each path}}...{{/each}}` repeats its body for each item of an array (nothing for a missing or empty one). Inside, `{{this}}` is the item and `{{@index}}` its zero-based index, and a name is looked up on the item first and then on the surrounding data.
- Blocks can be nested. A block that is not closed, or a closing tag without an opening one, throws.

## 7. `src/expr.js`
- `evaluate(expression, variables?)` returns a number.
- Numbers (`2`, `3.14`), `+ - * / %`, `^` for power, parentheses, unary `-` and `+`, variables (letters, digits and underscores, not starting with a digit) taken from `variables`, and the functions `min(...)`, `max(...)`, `abs(x)`, `round(x)` (as `Math.round`) and `sqrt(x)`. Whitespace is ignored.
- Precedence, lowest to highest: `+ -`, then `* / %`, then unary minus and plus, then `^`. So `-2 ^ 2` is -4. `^` is right-associative and its exponent may carry a sign (`2 ^ -1` is 0.5); the other binary operators are left-associative.
- Exports a class `ExprError` (extends `Error`). `evaluate` throws an `ExprError` for a syntax error, an unknown variable or function, and division or modulo by zero.

## 8. `src/glob.js`
- `match(pattern, path)` returns whether the whole path matches the pattern. Paths use `/` as the separator. Matching is case-sensitive.
- `*` matches any run of characters (including none) that does not contain `/`. `?` matches exactly one character that is not `/`.
- `**` as a whole path segment matches zero or more whole segments: `a/**/b` matches `a/b` and `a/x/y/b`; `**/b` matches `b` and `x/y/b`; `a/**` matches everything below `a/` but not `a` itself; `**` alone matches everything.
- `[abc]` matches one of the listed characters, `[a-z]` a range, `[!abc]` any one character not listed. None of them matches `/`.
- `{a,b,c}` matches any one of the comma-separated alternatives, which may contain the wildcards above (no nesting).
- Every other character matches itself, including characters that are special in regular expressions.

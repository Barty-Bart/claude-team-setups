# Deskhand: build spec

Build Deskhand, a help-desk ticket tracker for a support team: a JSON API, a browser front end, an automated test suite, a seed script and a README. It is a large job in several parts (core API, extended API, ticket screens, admin and reporting screens, tests, seed data and docs) that depend on each other only through the contract below.

## Ground rules
- Node 26, built-in modules only (`node:http`, `node:sqlite`, `node:crypto`, `node:test` and so on). No npm dependencies, no build step, no network requests to other hosts.
- `node server.js` starts everything on the port in the `PORT` environment variable (default 3000): the API under `/api` and the front end at `/`.
- All data is stored under the folder in the `DATA_DIR` environment variable (default `./data`) and survives a restart of the server. Login tokens do not have to survive a restart.
- Passwords are stored hashed, never in plain text.

## Part 1: API
All bodies are JSON. Errors always look like `{"error": {"code": "...", "message": "..."}}` with these codes: `validation` (400, also for malformed JSON), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409). Every endpoint except register and login needs an `Authorization: Bearer <token>` header and answers 401 without a valid one. Ids are integers or strings; the client treats them as opaque.

Objects:
- user: `{id, email, name, role, active}` where role is `admin` or `agent` and `active` is a boolean (true for new users). The first user ever registered is the admin; everyone after is an agent. Never return the password or its hash.
- ticket: `{id, title, description, status, priority, tags, createdBy, assigneeId, createdAt, updatedAt, commentCount}`. `status` is `open`, `pending`, `solved` or `closed`. `priority` is `low`, `normal`, `high` or `urgent`. `tags` is an array of lowercase strings without duplicates. `createdBy` is a user id, `assigneeId` is a user id or `null`. Times are ISO 8601 strings.
- comment: `{id, ticketId, authorId, body, createdAt}`.
- event: `{id, ticketId, actorId, type, data, createdAt}`, the audit trail of a ticket. Types and their `data`: `created` (`{}`), `edited` (`{fields: [...]}`, the changed ones among `title`, `description`, `priority`, `tags`), `status_changed` (`{from, to}`), `assigned` (`{from, to}`, user ids or `null`), `commented` (`{commentId}`). A PATCH records one event for each kind of change it really makes, and none if nothing changes.
- macro (a canned reply): `{id, title, body, createdBy}`.

Endpoints:
| Method and path | Body | Success | Notes |
|---|---|---|---|
| POST `/api/register` | `{email, password, name}` | 201 `{token, user}` | email must look like an email and is unique ignoring case (409 `conflict`); password at least 8 characters; name not empty |
| POST `/api/login` | `{email, password}` | 200 `{token, user}` | wrong email or password: 401 |
| POST `/api/logout` | | 204 | the token stops working |
| GET `/api/me` | | 200 `{user}` | |
| GET `/api/users` | | 200 `{items: [user]}` | |
| POST `/api/tickets` | `{title, description, priority?, tags?}` | 201 `{ticket}` | title 1 to 120 characters after trimming; description may be empty; priority defaults to `normal`; tags are trimmed, lowercased and deduplicated; new tickets are `open` and unassigned |
| GET `/api/tickets` | | 200 `{items: [ticket], total, page, pageSize}` | query parameters below |
| GET `/api/tickets/:id` | | 200 `{ticket}` | |
| PATCH `/api/tickets/:id` | any of `{title, description, priority, tags, assigneeId, status}` | 200 `{ticket}` | `assigneeId` must be an existing user id or `null`; status changes follow the rules below; `updatedAt` changes |
| DELETE `/api/tickets/:id` | | 204 | admin only (403 for agents); also deletes the ticket's comments |
| GET `/api/tickets/:id/comments` | | 200 `{items: [comment]}` | oldest first |
| POST `/api/tickets/:id/comments` | `{body}` | 201 `{comment}` | body 1 to 2000 characters after trimming; 409 `conflict` if the ticket is closed; updates the ticket's `updatedAt` and `commentCount` |
| GET `/api/stats` | | 200 `{total, unassigned, byStatus, byPriority}` | `byStatus` and `byPriority` always contain all four keys, with 0 where there are none |
| PATCH `/api/users/:id` | any of `{name, role, active}` | 200 `{user}` | admin only (403). The last active admin cannot be demoted or deactivated (409). A deactivated user cannot sign in (403 `forbidden`) and their existing tokens stop working (401) |
| GET `/api/tickets/:id/events` | | 200 `{items: [event]}` | oldest first; gone when the ticket is deleted |
| POST `/api/tickets/bulk` | `{ids, changes}` | 200 `{updated: [id], failed: [{id, code, message}]}` | `changes` is any of `{status, priority, assigneeId}` and is applied to each ticket under the same rules as PATCH; a ticket that cannot take it is listed in `failed` with the error code it would have got (`conflict`, `not_found`); an empty or invalid `changes` is a 400 for the whole request |
| GET `/api/tickets/export.csv` | | 200, `Content-Type: text/csv` | same filter and sort parameters as the list, no paging; format below |
| POST `/api/tickets/import` | CSV text sent with `Content-Type: text/csv` | 200 `{created, errors: [{line, message}]}` | format below |
| GET `/api/macros` | | 200 `{items: [macro]}` | sorted by title |
| POST `/api/macros` | `{title, body}` | 201 `{macro}` | title 1 to 60 characters, unique ignoring case (409); body 1 to 2000 characters |
| PATCH `/api/macros/:id` | any of `{title, body}` | 200 `{macro}` | only the macro's creator or an admin (403) |
| DELETE `/api/macros/:id` | | 204 | only the macro's creator or an admin (403) |
| GET `/api/reports/summary` | | 200, see below | |

Query parameters for GET `/api/tickets` (all optional, combined with AND):
- `status`, `priority`: exact match. An unknown value is a 400.
- `assignee`: a user id, `me` (the caller) or `none` (unassigned).
- `tag`: tickets that have this tag.
- `q`: case-insensitive substring search in title and description.
- `sort`: `createdAt` (default), `updatedAt` or `priority` (urgent highest). `order`: `desc` (default) or `asc`.
- `page` (default 1) and `pageSize` (default 20, maximum 100). `total` is the number of matches before paging.

Status rules: `open` can become `pending` or `solved`; `pending` can become `open` or `solved`; `solved` can become `open` or `closed`; `closed` cannot change. Any other change is a 409 `conflict`. Setting a status to its current value is allowed and changes nothing. A closed ticket cannot be edited at all (409), but an admin can still delete it.

CSV export: a header line `id,title,status,priority,tags,assignee,createdAt,updatedAt,commentCount`, then one line per ticket. `tags` are joined with `;`. `assignee` is the assignee's email, or empty. Fields are quoted as in RFC 4180 when they need it.

CSV import: the first line is a header naming the columns, in any order, from `title`, `description`, `priority`, `tags`, `assignee`; only `title` is required. Each record creates a ticket owned by the caller: `tags` are separated by `;`, `assignee` is a user's email (ignoring case), an empty priority means `normal`. A record that is not valid (blank title, unknown priority, unknown assignee) is skipped and reported in `errors` with the number of the line it starts on (the header is line 1); the valid ones are still created and counted in `created`. Quoted fields may contain commas, quotes and line breaks.

Report summary: `{createdPerDay, solvedPerDay, topTags, avgHoursToSolve, byAssignee}`.
- `createdPerDay` and `solvedPerDay`: arrays of `{date: "YYYY-MM-DD", count}` for the last 14 days in UTC, oldest first, ending today, including days with 0. `solvedPerDay` counts changes of status to `solved`.
- `topTags`: up to five `{tag, count}`, most tickets first, ties in alphabetical order.
- `avgHoursToSolve`: over tickets that have been solved at least once, the average number of hours from creation to the first time they were solved; `null` when there are none.
- `byAssignee`: one `{userId, open, pending, solved, closed}` per user who has tickets assigned, plus one with `userId: null` for unassigned tickets if there are any.

## Part 2: Front end
A single-page app in plain HTML, CSS and JavaScript served at `/`. It must be pleasant to use on a desktop and on a 390 px wide phone. Our QA tooling finds elements by `data-testid`, so these are required:
- Signed out: a form `auth-form` with inputs `auth-email`, `auth-password` and, in register mode, `auth-name`; a button `auth-submit`; a control `auth-toggle` that switches between "sign in" and "register" mode (the form starts in sign-in mode); and `auth-error`, which shows the reason when signing in or registering fails.
- Signed in, on every screen: `current-user` (the user's name) and `logout-button`. The token is kept in `localStorage`, so a reload keeps the user signed in and on the same screen.
- Ticket list at `#/tickets` (the default screen after signing in): a container `ticket-list` with one `ticket-row` per ticket (each has a `data-ticket-id` attribute, shows title, status, priority and assignee, and opens the ticket when clicked); selects `filter-status` and `filter-priority` (each with an empty-value "all" option plus the four values); a text input `search-input` that filters as you type (through the API's `q`); buttons `page-prev` and `page-next` with 20 tickets per page; a button `new-ticket-button`; and a stats bar with `stat-open`, `stat-pending`, `stat-solved`, `stat-closed` and `stat-unassigned`, each showing its number from `/api/stats`.
- New ticket at `#/new`: a form `ticket-form` with `ticket-title`, `ticket-description`, `ticket-priority` (select), `ticket-tags` (text, comma-separated) and `ticket-submit`. After a successful submit the app opens the new ticket. A validation failure is shown in `ticket-error`.
- Ticket detail at `#/tickets/<id>`: a container `ticket-detail` with `detail-title`, `detail-status`, `detail-priority`, `detail-tags`; one button per allowed status change named `transition-pending`, `transition-solved`, `transition-open`, `transition-closed` (only the allowed ones are present); a select `assignee-select` listing "Unassigned" (empty value) and every user (value = user id), which saves on change; the comments as `comment-item` elements, oldest first; a textarea `comment-input` and a button `comment-submit` (both absent or disabled on a closed ticket); a `delete-ticket` button shown to admins only; and a link or button `back-to-list`.
- Navigation, on every signed-in screen: links `nav-tickets`, `nav-reports`, `nav-macros`, `nav-import` and, for admins only, `nav-users`.
- Ticket list, additionally: each `ticket-row` contains a checkbox `row-check`; a select `bulk-status` (an empty option plus the four statuses) and a button `bulk-apply` change the status of the checked tickets through the bulk endpoint, show the outcome in `bulk-result` (for example "2 updated, 1 failed") and refresh the list and the stats; a button `export-button` downloads the list, with the current filters, as a file named `tickets.csv`.
- Ticket detail, additionally: the ticket's events as `event-item` elements, oldest first, each saying who did what; and a select `macro-select` (an empty option plus one per macro, value = macro id) that appends the chosen macro's body to `comment-input`.
- Macros at `#/macros`: one `macro-row` per macro showing its title, with a `macro-delete` button where the user is allowed to delete it; a form `macro-form` with `macro-title`, `macro-body` and `macro-submit`; failures are shown in `macro-error`.
- Import at `#/import`: a textarea `import-text`, a button `import-submit`, and `import-result`, which shows how many tickets were created and every error with its line number.
- Reports at `#/reports`: `report-avg-solve` (the average hours to solve, or a dash when there is none); a bar chart `chart-created` drawn as SVG with one `chart-bar` element per day (14 of them) whose height follows the count; the top tags as `top-tag` elements; and a table of tickets per assignee.
- Users at `#/users`: for an admin, one `user-row` per user (with a `data-user-id` attribute) containing a select `role-select` (`admin`, `agent`) and a checkbox `active-toggle`, both saving on change, with failures (such as demoting the last admin) shown in `users-error`. An agent who opens `#/users` sees `forbidden-message` instead.

## Part 3: Tests
`node --test` in this folder runs an automated suite that starts the server on a free port with a temporary `DATA_DIR` and exercises every endpoint, including the error cases and the status rules. It must pass and must not leave anything behind in `./data`.

## Part 4: Seed script and README
- `node seed.js` fills an empty `DATA_DIR` with demo data: an admin `admin@deskhand.test` and an agent `agent@deskhand.test`, both with the password `deskhand-demo`, and at least 25 realistic tickets spread over all statuses and priorities, some assigned, some with comments, and three macros. Running it against a non-empty `DATA_DIR` changes nothing and says so.
- `README.md`: how to run, test and seed; and a reference for the API.

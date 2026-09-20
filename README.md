# Tasker

A task manager built on **React 19 · TypeScript · TanStack Start · MongoDB Atlas**, with TanStack Start server functions as the only application boundary.

It does the ordinary things — create, edit, complete, search, filter, delete, undo — and it does them from the keyboard first, against a real database, with every result set addressable as a URL.

Two source documents were supplied for this build and they disagree in about a dozen concrete places. [PLAN.md](PLAN.md) is the full working plan; the decisions taken at each disagreement are reproduced in [Design decisions](#design-decisions) below, so that the gaps read as choices rather than oversights.

---

## Run it in five minutes

Requires **Node 22+** and a MongoDB connection string (Atlas free tier is fine).

```bash
git clone <this repo> && cd blue-agilis-takehome-todo-app
npm install

cp .env.example .env        # then fill in MONGODB_URI
npm run db:check            # confirms the connection before anything else

npm run seed                # two accounts, twelve tasks, four lists
npm run dev                 # http://localhost:3000
```

`npm run seed` prints the fixture accounts. They are:

| Account             | Password              | Owns                                                     |
| ------------------- | --------------------- | -------------------------------------------------------- |
| `ada@example.com`   | `seed-password-ada`   | the ten tasks from the design's List screen              |
| `grace@example.com` | `seed-password-grace` | two tasks, so permissions have something to fail against |

Credentials for a throwaway database, in the open on purpose.

**You do not have to sign in.** The first visit creates a guest account — a real row with a real owner id — so the app is usable immediately and every permission check behaves exactly as it does for a claimed account. Signing up claims that same row, so tasks created as a guest need no migration.

### What to try first

Unplug the mouse, then:

`N` → type `Ship the release notes #Docs !p1 tomorrow 4pm` → `↵`
`↓` to select · `Space` to advance status · `E` to rename · `↵` to open the detail
`/` to search · `⌘K` for everything else · `?` for the map
`1` `2` `3` set the selected task's status, or filter the list when nothing is selected — the strip along the bottom says which

Then reload. It is all still there, because it was in MongoDB the whole time.

---

## The stack, and why

| Choice                                      | Reason                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TanStack Start**                          | Server functions give one typed boundary — no REST layer to keep in sync with the client. The router owns _when_ data is needed; Query owns its lifecycle.                             |
| **TanStack Query, one `['tasks']` key**     | A single canonical cache. All filtering is derived at render, so typing never refetches and the cache never fragments per filter combination.                                          |
| **MongoDB, native driver**                  | No ODM. The repository is thirty lines of `find`/`findOneAndUpdate`; a generic repository framework would hide the one thing worth seeing, which is that `ownerId` is in every filter. |
| **Zod, shared by form and server function** | One schema validates the composer _and_ the boundary. They cannot drift because they are the same object.                                                                              |
| **CSS Modules + custom properties**         | The design is a fixed token set, not a themed system. Runtime CSS-in-JS is an SSR-hydration liability and buys nothing here.                                                           |
| **No client state library**                 | Server data lives in Query, filters live in the URL, and drafts live in `useState`. Nothing is left for Redux or Zustand to own.                                                       |

---

## Architecture

```
src/
├── routes/                    __root · _shell · _shell._list · /t/$id · /board · /board/t/$id
├── features/tasks/
│   ├── task.server.ts         createServerFn boundary — the ONLY way in
│   ├── task.service.ts        domain rules, ownership, error mapping
│   ├── task.repo.ts           Mongo access + DTO mapping
│   ├── task.query.ts          queryOptions + optimistic mutation hooks
│   ├── task.filters.ts        filter / sort / group          (pure)
│   └── task.parse.ts          composer token parser          (pure)
├── features/lists/            the same five files, for lists
├── features/auth/             accounts, scrypt, opaque server-side sessions
├── server/                    db · env · logger · errors      (server-only)
└── shared/                    Button · Field · Pill · Dialog · Toast · hooks · key map
```

**One request, end to end:**

```
GET /?q=focus&status=todo
  → validateSearch (Zod)          malformed params fall back, never crash
  → loader: ensureQueryData       the FULL list, unfiltered
  → listTodos() server fn         Zod → service → repo → MongoDB
  → DTO map                       WithId<Document> → Task, never a driver shape
  → SSR of the DERIVED visible set
  → HTML + dehydrated cache → hydrate
```

There is no `useEffect` fetching anywhere in the app.

**Four things worth knowing:**

- **The detail is a slot, not a page.** `/t/$id` renders into the list layout's outlet and `/board/t/$id` into the board's, so opening a task never unmounts the view you were looking at. One panel component, two slots.
- **Optimism always ships with its rollback.** Every optimistic mutation snapshots the cache, writes, and restores that exact snapshot on failure — asserted in a test in the same PR. Mutation keys are per task id, so two rows cannot race each other.
- **Creating a list is deliberately _not_ optimistic.** A list id is a foreign key: the composer, the panel and the filters all send it back to a server that validates it. A temporary id in the cache is an invalid reference waiting to be sent — and it was sent, once.
- **Permission is enforced in the query filter, never in the UI.** `find({ _id, ownerId })`. A task that is not yours does not match, and the answer is `NOT_FOUND` rather than `FORBIDDEN`, because `FORBIDDEN` confirms the id was a real one.

---

## Design decisions

Every row below is a real conflict between the two supplied documents, and the call taken. The full reasoning is in [PLAN.md §3](PLAN.md).

| #       | Conflict                                                                                                          | Resolution                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | System design: `title, status` only. FE design: `+ notes, dueAt, priority, listId, assignee, subtasks, activity`. | Core **+ `notes`, `dueAt`, `priority`, `listId`**. Assignee, subtasks and the activity log are cut — they imply sharing and cross-account visibility, and ownership is not assignment.                                                                                |
| **D2**  | Status is `todo\|in-progress\|done` in one document, `todo\|doing\|done` in the other.                            | **`todo\|doing\|done`** on the wire; "To do / In progress / Done" on screen. Persisting a display string is the anti-pattern.                                                                                                                                         |
| **D3**  | "Pending UI and server reconciliation" vs "the row appears the instant you press ↵".                              | **Optimistic**, with `tmp_` ids that are never sent to the server and a tested reject path. Not actually a conflict: §7 permits optimism when temp ids are handled deliberately.                                                                                      |
| **D4**  | Client-side filtering vs server-side filtering.                                                                   | **One canonical `['tasks']` query, filtered at render.** `listTodos` still accepts and applies validated `{ q, status[], due, sort }` server-side, fully tested — the scaling seam is real, the app just does not use it yet.                                         |
| **D5**  | `view` appears as a search param _and_ a route _and_ a device preference.                                         | **`/` and `/board` are routes.** `lastView` lives in `localStorage` and only decides where a _bare_ visit lands. No `view` param, so no drift.                                                                                                                        |
| **D6**  | An offline write queue and a "Synced · works offline" chip.                                                       | **Cut, not faked.** A badge claiming durability the app does not have is worse than no badge.                                                                                                                                                                         |
| **D7**  | Concurrent-edit conflict resolution.                                                                              | **Cut.** Needs multi-user plus revision fields.                                                                                                                                                                                                                       |
| **D8**  | Task refs like `TSK-118` vs Mongo's `ObjectId`.                                                                   | `id` is an opaque hex string; the UI renders a **derived** `TSK-` + last four hex. No counter collection, no extra write.                                                                                                                                             |
| **D9**  | Composer parses `#list @person !p1 ~doing tomorrow 4pm`.                                                          | `#list`, `!p1..p3`, `~status` and dates ship. **`@person` cut**, following D1. Dates resolve client-side to an exact ISO instant.                                                                                                                                     |
| **D10** | `⌘Z` / `⇧⌘Z` undo–redo.                                                                                           | **Only delete is undoable**, via `restoreTodo({ undoToken })` and the 8-second toast. A general undo stack is a command-history architecture the design only ever _shows_ on the delete path.                                                                         |
| **D11** | Board drag-and-drop with a WIP limit.                                                                             | Keyboard movement (`⇧→`, `Space`) is the **contract** and was built first; pointer drag dispatches into the same moves. WIP limit cut.                                                                                                                                |
| **D12** | Saved views (`⇧1…3`).                                                                                             | **Cut.** A persistence feature wearing a filter costume.                                                                                                                                                                                                              |
| **D13** | "No auth architecture unless required."                                                                           | **Required.** The app is deployed publicly, and with no identity anyone holding the URL can read and delete everything. Accounts landed in Sprint 3, ahead of search, the palette and the board, because `ownerId` enters the filter of every query written after it. |
| **D14** | Lists were a fixed enum.                                                                                          | **A CRUD-able collection**, owned per account, with its own service, schema and permission tests. A fixed set of un-editable lists is not a feature, it is a stub.                                                                                                    |

### Designed but not built

So that nothing here reads as an oversight: **assignees and people · subtasks · activity log · offline write queue · concurrent-edit conflict resolution · saved views · a general undo/redo stack · board WIP limits · recent searches.** Each is cut for the reason given above or in PLAN.md §3.

The largest deliberate gap is the **offline queue** (D6).

---

## Acceptance criteria

The rubric text was not supplied; these seven are reconstructed from the FE design's own architecture screen, which maps `listTodos → AC 2·5·6`, `createTodo → AC 1`, `updateTodo → AC 3·6`, `deleteTodo → AC 4`. If the real rubric differs, the traceability column changes and the code does not.

| AC      | Statement                     | Proved by                                                              |
| ------- | ----------------------------- | ---------------------------------------------------------------------- |
| **AC1** | Create a task                 | `tests/e2e/critical-path.spec.ts` step 2 · `tasks.spec.ts`             |
| **AC2** | View the list of tasks        | step 1, asserted against the **raw HTML** so it proves a server render |
| **AC3** | Edit a task                   | step 3 · `detail.spec.ts` · `tasks.spec.ts` inline edit                |
| **AC4** | Delete a task                 | steps 6–7, including undo                                              |
| **AC5** | Search by text                | step 4 · `filters.spec.ts`                                             |
| **AC6** | Filter by status              | step 5 · `filters.spec.ts`                                             |
| **AC7** | Changes persist across reload | step 8, plus a second page with its own cache                          |

`tests/e2e/critical-path.spec.ts` runs the whole flow with a pointer; `tests/e2e/keyboard-only.spec.ts` runs the same flow without touching one.

---

## Testing

```bash
npm test                 # unit + component (jsdom and node)
npm run test:e2e         # Playwright, against its own database on port 3001
npm run test:integration # service layer against a real MongoDB
npm run build && npm run test:artifact   # the built server, booted and asked for pages
```

Five tiers, each with a different job:

| Tier            | What only it can catch                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| **Unit**        | Schema rules, filter/sort/group, the composer parser, key resolution.                          |
| **Component**   | Rollback to the exact cache snapshot, focus return, both empty states, `axe` on every suite.   |
| **Integration** | That one account cannot reach another's data. A browser-only guard cannot make it pass.        |
| **E2E**         | The critical path, pointer and keyboard-only, plus a 360px phone project.                      |
| **Artifact**    | That the thing that ships works. It boots `.output/server/index.mjs` and requests every route. |

That last tier exists because it was missing. A build that passed every other check reached a deployment and **404'd on every path** — there was no server in the output at all. A later one booted and then failed its first database call with `Node.js crypto module is required for SCRAM-SHA-1 authentication`, because bundling had rewritten the driver's conditional `require`. Every tier above tests _source_; nothing loaded the bundle. Now something does.

Accessibility is gated, not audited once: `vitest-axe` on every component suite and Playwright's axe on every route, and CI fails on a new violation.

---

## Secrets

`MONGODB_URI` is the only real credential, and four independent guards keep it out of the repo and out of the browser. None of them relies on remembering.

1. **Out of git.** `.gitignore` ignores `.env*` in the **first commit**, before any env file could exist. `gitleaks` scans the full history on every PR with an added database-URI rule (the default ruleset does not match a connection string). CI also asserts that no env file has _ever_ been committed — `git ls-files` only sees the current tree, and a secret committed once is in the history forever.
2. **Out of the bundle.** No secret carries a `VITE_` prefix, because that prefix _is_ the publication mechanism. `src/server/env.ts` is marked server-only for the build's import tracer **and** throws at module scope if it is ever evaluated in a browser.
3. **Out of the SSR payload.** The loader dehydrates the Query cache into the HTML, so only mapped `Task`, `List` and `User` DTOs ever enter that cache. Cache hygiene is a secrecy control here, not just a coupling one — this is the vector that is easiest to miss.
4. **Proved, per PR.** `npm run test:artifact` greps every built asset and the server-rendered HTML for the URI, its host, its user and its password. A hit fails the build and is reported by offset and length, so no CI log ever prints the secret it found.

To check by hand on the deployed app: View Source and search for the cluster host, then search every loaded JS asset and the dehydrated state payload. Nothing.

---

## Deploying

The app builds to a nitro server. On Vercel it emits `.vercel/output`; anywhere else, `.output/server/index.mjs`, started with `npm start`.

```bash
npm run build
npm start            # http://localhost:3000
```

Set `MONGODB_URI` and `MONGODB_DB` in the host's **encrypted, server-side** environment settings. Never in `vercel.json`, never in a committed config, never in a build argument that echoes into a log.

**On Atlas:**

- A database user with `readWrite` on the one application database — not `atlasAdmin`, not cluster-wide.
- **Separate credentials for preview and production**, so a leaked preview credential cannot reach production data.
- Network access: **the allow list is currently open (`0.0.0.0/0`)**, and this is worth stating plainly rather than burying. Vercel's serverless functions have no stable egress IP range on the plan this is deployed to, so an allow list would have to be the whole platform anyway. The mitigations are the ones that matter regardless: the credential is least-privilege, scoped to one database, and rotatable in the procedure below.

### Rotating the credential

Written out because a credential _will_ eventually need rotating, and the middle of an incident is a bad time to work out the order.

1. Atlas → Database Access → **create a second user** with the same `readWrite` scope and a new password. Do not edit the existing one; two working credentials means no downtime.
2. Update `MONGODB_URI` in the host's environment settings to the new user, then **redeploy**. Changing an env var does not restart a running deployment.
3. Confirm the deployment is serving: load the app, create a task, reload.
4. Atlas → **delete the old user**. The old string is now inert wherever it leaked to.
5. Update your local `.env`. Rotate `.env.e2e` too if it carries its own URI.
6. If the leak reached git, rotating is step one but not the last step — the old credential stays in the history until the history is rewritten.

---

## Known gaps

Honest list, in the order they would be worth closing:

- **The offline queue (D6)** is the largest designed-but-absent feature.
- **Pagination.** `listTasks` caps at 500 documents. The seam is there; nothing above it pages.
- **The `/_dev/components` route ships in the production bundle.** It is the component inventory used during the build. Harmless, and a few KB.
- **Lighthouse is not gated in CI.** On a shared runner its timings vary by more than the 1.0s budget, so it would fail for reasons unrelated to the change under review. The artifact tier gates the server's own render time instead, which is the part this repo controls.
- **Row-removal motion is absent.** The list is handed an already-filtered array, so it cannot tell a delete from a search keystroke — and an exit animation that fires on every keystroke is worse than none.

---

## Commands

| Command                                       | What it does                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                                 | Dev server on :3000                                         |
| `npm run build` / `npm start`                 | Build, then run the built server                            |
| `npm run seed`                                | Two accounts, four lists, twelve tasks                      |
| `npm run db:check`                            | Confirms the connection string works, prints nothing secret |
| `npm run typecheck` / `lint` / `format:check` | The three static gates                                      |
| `npm test`                                    | Unit and component                                          |
| `npm run test:e2e`                            | Playwright, own database, own port, never reuses a server   |
| `npm run test:integration`                    | Service layer against a real MongoDB                        |
| `npm run test:artifact`                       | Boots the built server and interrogates it                  |

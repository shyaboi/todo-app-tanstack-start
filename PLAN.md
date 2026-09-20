# Tasker — Implementation Plan

> The single planning artifact for this build. §2 (acceptance criteria) and §3 (design reconciliation) carry forward into the README.

---

## 1. Context

**What we're building.** A production-shaped task-management app ("Tasker") for a take-home evaluation, built on **React 19 + TypeScript + TanStack Start**, backed by **MongoDB Atlas**, with TanStack Start server functions as the only application boundary.

**Why this plan exists.** Two authoritative documents were supplied, and they disagree in several concrete places:

- **The system design** specifies a deliberately minimal domain (`id, title, status, createdAt, updatedAt`), client-side filtering, non-optimistic creation, and an explicit non-goals list (no auth, no offline sync, no pagination).
- **The FE design** (13 screens: List, Board, Detail, Composer, Search & Filters, Command Palette, Keyboard Map, States, Mobile ×2, Foundations, Components, Architecture) renders a considerably richer product: `dueAt`, `priority`, `listId`, assignees, subtasks, an activity log, a status board with drag-and-drop, an offline write queue, saved views, and concurrent-edit conflict resolution.

Shipping both at full fidelity is not possible in a take-home, and pretending otherwise produces a half-built app with a lot of dead chrome. **Section 3 records every conflict and the resolution taken**, so the reviewer can see that the gaps are decisions rather than oversights.

**The outcome we want.** An app where a reviewer can clone, set one env var, seed, and in five minutes exercise the complete critical path — load → create → update status → search → filter → delete → undo → reload and see it persisted — with the keyboard alone, and where each architectural layer visibly has exactly one job.

**A reversal, recorded deliberately.** The system design lists auth as an explicit non-goal, and Sprints 0–2 were built that way. That call does not survive a public deployment: with no identity, anyone holding the URL can read, edit and delete every task, and `updateTodo` accepts any task id from any caller. Sprint 3 therefore adds accounts and per-owner permissions before any further feature work. See **D13**.

**Standing principle.** _When in doubt about design, follow TanStack/React component design best patterns — no anti-patterns._ Where the design docs and idiomatic TanStack disagree, idiom wins and the deviation gets a line in §3.

---

## 2. Assumed acceptance criteria

The FE design cites "the seven acceptance criteria" and maps server functions to them, but the rubric text was not supplied. Reconstructed from the architecture screen's own mapping (`listTodos → AC 2·5·6`, `createTodo → AC 1`, `updateTodo → AC 3·6`, `deleteTodo → AC 4`):

| AC      | Statement                                     | Primary server fn                      | Proven by             |
| ------- | --------------------------------------------- | -------------------------------------- | --------------------- |
| **AC1** | Create a task                                 | `createTodo`                           | Sprint 1 · E2E step 2 |
| **AC2** | View the list of tasks                        | `listTodos`                            | Sprint 1 · E2E step 1 |
| **AC3** | Edit a task (title and fields)                | `updateTodo`                           | Sprint 2 · E2E step 3 |
| **AC4** | Delete a task                                 | `deleteTodo`                           | Sprint 2 · E2E step 6 |
| **AC5** | Search tasks by text                          | `listTodos({ q })`                     | Sprint 4 · E2E step 4 |
| **AC6** | Filter tasks by status                        | `listTodos({ status })` + `updateTodo` | Sprint 4 · E2E step 5 |
| **AC7** | Changes persist across reload (real database) | all                                    | Sprint 1 · E2E step 7 |

> Accounts are not among these. Nothing in the rubric implies them, but a hosted app without identity leaves all seven criteria operating on data anyone can change, so Sprint 3 treats them as a prerequisite rather than a feature (**D13**).

> ⚠️ **These are reconstructed, not given.** Every sprint goal below is written against this table. If the real rubric differs, the sprint _contents_ barely change — only the traceability column does.

---

## 3. Source-of-truth reconciliation

Each row is a real conflict between the two supplied documents, and the call taken. This table becomes a "Design decisions" section in the README.

| #       | Conflict                                                                                                                                                                                           | Resolution                                                                                                                                                                                                                                    | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | System design: `title, status` only. FE design: `+ notes, dueAt, priority, listId, assignee, subtasks, activity`.                                                                                  | **Core + `notes`, `dueAt`, `priority`, `listId`.** Assignee, subtasks and activity log are **cut**.                                                                                                                                           | The kept fields are what the composer, row, filters, sort and grouping actually consume. The cut fields imply a _multi-user_ concept: assignment means handing a task to someone else, which needs sharing, invitations and cross-account visibility. Sprint 3 adds accounts, but ownership is not assignment — a task belongs to exactly one person and is invisible to everyone else. Assignees stay cut, now for that reason rather than for the absence of users. |
| **D2**  | System design §5: status is `'todo' \| 'in-progress' \| 'done'`. FE design: "One of `todo · doing · done`", and the URL example is `?status=todo,doing`.                                           | **`todo \| doing \| done`** on the wire and in the DB. Display labels stay "To do / In progress / Done".                                                                                                                                      | The FE design's is URL-safe and appears in a literal search-param example. Persisting a display string is the anti-pattern here.                                                                                                                                                                                                                                                                                                                                      |
| **D3**  | System design §7: "I prefer **pending UI + server reconciliation** for creation because the database owns the real ID." FE design: "The row appears the instant you press ↵, with a temporary id." | **Optimistic create with deliberate temp-id handling.**                                                                                                                                                                                       | Not actually a conflict — §7 permits optimism "only if temporary IDs are handled deliberately". The FE design specifies the full contract including the reject path (row slides out, error toast with Retry), so the bar is met. Temp ids are namespaced `tmp_*` and are never sent to the server.                                                                                                                                                                    |
| **D4**  | System design §10: filtering stays **client-side**. FE design: "Search and status filtering run on the **server** for the initial render and in the cache for keystrokes."                         | **One canonical `['tasks']` query holding the unfiltered list; all filtering derived at render.** `listTodos` still _accepts and applies_ validated `{ q, status[], due, sort }` server-side, fully tested — but the app calls it unfiltered. | Derived filtering is the system design's stated position for this dataset size and is what Failure Checks 1 and 7 demand. Keying the query by filters would thrash the cache on every keystroke. Implementing the server-side filter anyway keeps the documented §22 scaling seam real and gives AC5/AC6 a server-boundary test, at near-zero cost.                                                                                                                   |
| **D5**  | FE design lists `view` as a **URL search param** _and_ `board.tsx` as a **route** _and_ `lastView` as a **device preference** — three owners for one value.                                        | **`/` and `/board` are routes.** `lastView` lives in `localStorage` and only decides where a bare visit lands. **No `view` search param.**                                                                                                    | This is Failure Check 7 ("Filter State Drift") in the design's own docs. Routes give code-splitting and distinct loaders; one owner, no drift.                                                                                                                                                                                                                                                                                                                        |
| **D6**  | FE design shows a full offline write queue, a queue-depth badge, and a "Synced · works offline" chip. System design §19: "no service workers / offline sync".                                      | **Cut.** The chip is **removed**, not faked.                                                                                                                                                                                                  | A badge that claims durability the app does not have is worse than no badge. Called out in the README as the single largest intentional gap.                                                                                                                                                                                                                                                                                                                          |
| **D7**  | FE design shows concurrent-edit conflict resolution ("Rae edited this task while you were typing · Keep mine / Take theirs").                                                                      | **Cut.**                                                                                                                                                                                                                                      | Requires multi-user + revision fields; system design §22 files both under future scaling.                                                                                                                                                                                                                                                                                                                                                                             |
| **D8**  | FE design shows task refs like `TSK-118`. MongoDB yields `ObjectId`.                                                                                                                               | DTO exposes `id` as an opaque hex string (Failure Check 5). The UI renders a **derived** display ref: `TSK-` + last 4 hex of `id`, uppercased.                                                                                                | Visually faithful with no counter collection and no extra write on the create path. Noted as a cosmetic deviation.                                                                                                                                                                                                                                                                                                                                                    |
| **D9**  | FE design composer parses `#list @person !p1 ~doing tomorrow 4pm`.                                                                                                                                 | `#list`, `!p1..p3`, `~status` and dates ship. **`@person` is cut** (follows D1).                                                                                                                                                              | Dates resolve **client-side to an exact ISO instant** before the request, exactly as the design's validation contract specifies.                                                                                                                                                                                                                                                                                                                                      |
| **D10** | Keyboard map includes `⌘Z` / `⇧⌘Z` undo–redo.                                                                                                                                                      | **Only delete is undoable**, via `restoreTodo({ undoToken })` and the 8-second toast. A general undo stack is cut.                                                                                                                            | A real undo stack is a command-history architecture; the design only ever _shows_ undo on the delete path.                                                                                                                                                                                                                                                                                                                                                            |
| **D11** | Board shows pointer drag-and-drop with a WIP limit.                                                                                                                                                | Keyboard card movement (`⇧→`, `Space` pick up/drop) ships **first and is the contract**; pointer DnD is the last PR of its sprint and is droppable. WIP limit is cut.                                                                         | The design's own accessibility contract says DnD must have a full keyboard equivalent. Building the keyboard path first guarantees it isn't retrofitted.                                                                                                                                                                                                                                                                                                              |
| **D13** | System design §19: "no auth architecture unless required". The app is deployed publicly, so anyone with the link can read and mutate every task.                                                   | **Required. Sprint 3 adds first-party accounts and per-owner scoping**, ahead of search, the palette and the board.                                                                                                                           | The non-goal was written for a local demo. A hosted app with no identity is not a scope decision, it is an open database. Deferring it also gets more expensive every sprint: every query, mutation, test and seed written meanwhile has to be revisited. See §4.8 for the design.                                                                                                                                                                                    |
| **D12** | "Saved views" (`⇧1…3`) in the filter panel.                                                                                                                                                        | **Cut.**                                                                                                                                                                                                                                      | It is a persistence feature wearing a filter costume; no AC touches it.                                                                                                                                                                                                                                                                                                                                                                                               |

**Explicitly designed but not built** (README section, so nothing reads as an oversight): assignees/people · subtasks · activity log · offline queue · conflict resolution · saved views · undo/redo stack · board WIP limits · "Load sample list" button (replaced by the seed script) · recent searches.

---

## 4. Architecture

### 4.1 State ownership — one owner per value

| State                                          | Owner                               | Notes                                      |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| Persistent task data                           | MongoDB                             | Server owns `id`, `createdAt`, `updatedAt` |
| Client mirror of server data                   | TanStack Query, key `['tasks']`     | The **only** server-state cache            |
| `q` · `status` · `due` · `sort`                | Router search params, Zod-validated | Every result set is a link                 |
| Composer draft · palette query · row selection | Local React state                   | Losing it on reload is correct             |
| `lastView` · `showCompleted` · `density`       | `localStorage`                      | Never in a link, never sent to the server  |

Per system design §2: no Zustand, Redux, Context-as-store, or TanStack DB.

### 4.2 Routes

```
routes/
├── __root.tsx                  shell · command palette · toast host · aria-live region
├── sign-in.tsx                 /sign-in
├── sign-up.tsx                 /sign-up
├── _shell.tsx                  sidebar + topbar layout
├── _shell._list.tsx            PATHLESS — owns the task list + <Outlet/>
│   ├── _shell._list.index.tsx    /          list, detail slot empty
│   └── _shell._list.t.$todoId.tsx /t/$id    detail panel, list stays mounted
└── _shell.board.tsx            /board       status columns
```

The pathless `_list` layout is the deliberate choice (ref. the standing principle): it yields the exact URLs the design specifies (`/`, `/t/$id`) **while keeping the list mounted and scrolled** when the detail panel opens. The anti-patterns avoided are (a) a detail modal driven by local state, which loses deep-linkability, and (b) sibling routes, which unmount and re-fetch the list on every open.

### 4.3 Data flow

```
GET /?q=focus&status=todo,doing
  → route match → validateSearch (Zod)
  → loader: queryClient.ensureQueryData(tasksQuery)   ← full list, unfiltered
  → listTodos() server fn → Zod → service → repo → MongoDB
  → DTO map (WithId<Document> → Task)                 ← Failure Check 5
  → SSR render of DERIVED visibleTasks
  → HTML + dehydrated query state → hydrate
```

No `useEffect` fetching anywhere. The router decides _when_ data is needed; Query owns its lifecycle.

### 4.4 File tree

```
src/
├── routes/                        (as above)
├── features/tasks/
│   ├── components/  TaskComposer · TaskList · TaskRow · TaskDetailPanel
│   │                StatusPill · StatusControl · TaskFilters · SearchInput
│   │                BoardColumn · BoardCard · CommandPalette
│   ├── task.schema.ts             Zod — shared by form AND server fn
│   ├── task.server.ts             createServerFn boundary
│   ├── task.service.ts            domain ops, error mapping
│   ├── task.repo.ts               Mongo access + DTO mapping
│   ├── task.query.ts              queryOptions + mutation hooks
│   ├── task.types.ts              Task DTO, TaskStatus, Priority
│   ├── task.filters.ts            filterTasks / sortTasks / groupByDue  (pure)
│   └── task.parse.ts              composer token parser                 (pure)
├── features/auth/
│   ├── components/  SignInForm · SignUpForm · AccountMenu
│   ├── auth.schema.ts             Zod — credentials, shared by form AND server fn
│   ├── auth.server.ts             signUp · signIn · signOut · me
│   ├── auth.service.ts            hashing, session lifecycle
│   ├── auth.repo.ts               users + sessions collections
│   ├── auth.session.ts            cookie read/write, server-only
│   └── auth.types.ts              User DTO (never carries passwordHash)
│
├── server/  db.ts · env.ts · logger.ts · errors.ts
└── shared/
    ├── components/  Button · Field · Pill · Kbd · Dialog · Toast · LiveRegion · Skeleton
    ├── hooks/       useShortcuts · useFocusReturn · useSelection
    └── lib/         shortcuts.ts (key map + scopes) · palette.ts (command registry)
```

### 4.5 Command registry — one implementation per behaviour

Per system design §11, the palette is **another interface over existing commands**, not a second implementation:

```
Row delete button ─┐
⌘⌫ shortcut       ─┼──→ commands.deleteTask ──→ useDeleteTask() ──→ deleteTodo()
Palette "Delete"  ─┘
```

`palette.ts` is a registry of `{ id, label, hint, keys, scope, run }`. Shortcuts, the palette, and the mobile action sheet all dispatch into it. Adding a command in one place makes it reachable from all three.

### 4.6 Design tokens (extracted from Foundations)

```css
/* Neutral — nothing pure grey; everything shares the warm cast */
--surface: #ffffff --canvas: #fbfaf7 --sunken: #f4f3ef --hairline: #edece7
  --border: #dfddd5 --meta: #767267 --secondary: #57544b --ink: #1b1a16
  /* Rust — action & in-progress */ --rust-50: #fbf2ee --rust-100: #f8e5dc
  --rust-200: #ebcbbc --rust-400: #c9856a --rust-600: #a8462a
  --rust-700: #96401f --rust-800: #7a3a1e /* Pine — done & confirmed */
  --pine-50: #f2f7f4 --pine-100: #dce9e2 --pine-200: #c3d9cc --pine-400: #5c8b78
  --pine-600: #275c4c --pine-700: #1d463a;
```

- **Type** — Instrument Serif (display only) · Hanken Grotesk (everything read) · JetBrains Mono (keys, ids). Scale: display 40/44 · title1 24/30 · title2 18/24 · body 15/22 · row 14.5/20 · small 13/18 · micro 11/14 · mono 12/16.
- **Spacing** 4px base: 4·8·12·16·20·24·32·40·64. **Radius** 6 kbd · 9 control · 11 row · 14 panel · pill(999). **Controls** 44px default height (48px touch).
- **Focus** 2px ring, 2px offset, drawn on ink. _Never removed — only restyled._
- **Motion** 120ms hover/checkbox/chip · 180ms panel/popover · 240ms sheet/row-removal · **0ms under `prefers-reduced-motion`**. Nothing animates on load.
- **Contrast floors to hold:** ink/surface 17.4:1 · secondary/surface 7.6:1 · rust/surface 5.9:1 · every status pill ≥ 5.6:1.
- **Status is never colour alone** — every pill carries its label; the board adds a dot plus a column heading.

**Styling approach:** CSS Modules + custom properties. No runtime CSS-in-JS — it is an SSR-hydration liability (Failure Check 8) and this design is a fixed token set, not a themed system.

### 4.7 Secrets — never in the repo, never in the client

Non-negotiable, and enforced mechanically rather than by discipline. There are **four** distinct ways a secret escapes in this stack, and each gets its own guard.

**Leak vector 1 — committed to git.**

- `.gitignore` contains `.env`, `.env.*`, `!.env.example` **in the very first commit**, before any env file can exist. A secret committed once is in the history forever; ordering is the whole mitigation.
- `.env.example` ships **placeholder values only** — `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>`. Never a real cluster hostname, which is itself an attack surface.
- **`gitleaks` runs in CI on every PR and fails the build**, plus a `pre-commit` hook so it is caught before the push.

**Leak vector 2 — inlined into the client bundle.**

- **No secret ever gets a `VITE_` prefix.** Vite statically inlines every `VITE_*` variable into browser assets; the prefix _is_ the publication mechanism. `MONGODB_URI` and friends stay unprefixed and are read only through `process.env` inside server modules.
- `src/server/env.ts` is server-only and **throws at module scope if it is ever evaluated in a browser context**, so a stray client import fails loudly at build/dev time instead of silently shipping.
- Import discipline: `db.ts` and `env.ts` are imported **only** by `*.server.ts` / `task.repo.ts`. An ESLint `no-restricted-imports` rule enforces this — component and route files cannot reach them, so there is no module graph along which a secret can travel to the browser.

**Leak vector 3 — serialized into the SSR payload.** _(architecture-specific, and the easiest one to miss)_

- The route loader dehydrates the Query cache **into the HTML**. Anything placed in the cache server-side is delivered to the browser in plain text.
- Therefore: **only mapped `Task` DTOs ever enter the cache.** No config objects, no raw driver results, no `env`, no request context. This is the same rule as Failure Check 5, now load-bearing for secrecy as well as for coupling.

**Leak vector 4 — echoed through errors or logs.**

- `errors.ts` sanitizes at the boundary: the client receives a stable `AppError` code and human-readable message. Stack traces, connection strings, driver internals and `process.env` never cross the wire (§12, §15).
- The server logger redacts by key (`uri`, `password`, `token`, `secret`, `authorization`) and logs only operation · error class · duration · entity id.

**In the deployed environment.**

- `MONGODB_URI` is set in the host's encrypted environment settings as a **server-side-only** variable — never in `vercel.json`, never in a committed config, never in build args that echo to logs.
- **Preview and production use separate Atlas database users** with distinct credentials, so a leaked preview credential cannot touch production data.
- The Atlas user holds **least privilege**: `readWrite` on the single application database, nothing cluster-wide.
- **The IP access list is `0.0.0.0/0`, and that is not a shortcut — it is the only option this platform offers.** Vercel's serverless functions have no fixed egress IP on Hobby or Pro; they run across rotating AWS ranges, so there is no address to allow. Static egress needs Enterprise (Secure Compute) and Atlas PrivateLink needs a dedicated M10+ cluster; neither is available here. An earlier draft of this section promised an "IP allowlist restricted to the deployment platform", which was never achievable and is corrected here rather than repeated into the README.
- **What carries the weight instead**, since the network layer cannot: SCRAM authentication over TLS, the least-privilege single-database user above, separate credentials per environment, and rotation. The access list is not a control on this deployment, so it is not counted as one.
- Rotation procedure is one line in the README, on the assumption that a credential _will_ eventually need rotating. With an open access list it is the **primary** containment for a disclosed credential, not a formality.

**The assertion that proves it (PR 8.2).** After `npm run build`, a test greps the entire built client output — JS, CSS, source maps, and the SSR'd HTML — for the live `MONGODB_URI`, its host, its password, and every key in `env.ts`. **Any hit fails the build.** This runs in CI, so the guarantee is verified on every PR rather than assumed.

---

### 4.8 Identity and permissions

Constraints taken as given: **no third-party identity provider, no second datastore, and no API token to obtain from anywhere.** Everything runs on the MongoDB already in use and on Node's own crypto. That rules out OAuth, magic links (no mail service) and JWTs — and JWTs would be the wrong tool regardless, because a signed token cannot be revoked before it expires.

**Sessions are opaque and server-side.** Sign-in generates 256 bits from `crypto.randomBytes`, sends it as a cookie, and stores only its **SHA-256 hash** in `sessions`. A leaked database backup therefore yields no usable session, exactly as with passwords. Sign-out and password change delete the rows, so revocation is immediate — the property a JWT cannot offer.

```
sign-in ─→ verify password
        ─→ token = randomBytes(32)                 ← never stored
        ─→ sessions.insert({ tokenHash: sha256(token), userId, expiresAt })
        ─→ Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/
```

| Concern             | Decision                                                                                                       | Why                                                                                                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing    | `node:crypto` **scrypt**, per-password random salt, parameters recorded in the stored string                   | Memory-hard and in the standard library. argon2id is the stronger choice but needs a native module; scrypt avoids a compiled dependency while staying far above bcrypt-with-bad-params. The stored format carries its parameters so they can be raised later without invalidating existing hashes. |
| Password comparison | `crypto.timingSafeEqual`                                                                                       | A byte-by-byte `===` leaks the hash through response timing.                                                                                                                                                                                                                                       |
| Cookie              | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`                                                                 | `HttpOnly` means XSS cannot read it. `SameSite=Lax` stops cross-site form posts, which is the CSRF vector that matters for same-origin RPC.                                                                                                                                                        |
| Session lifetime    | 30-day absolute expiry, refreshed on use, plus a **TTL index** on `expiresAt`                                  | Mongo expires them itself — the same pattern `tasks_trash` already uses, so no sweeper process.                                                                                                                                                                                                    |
| Session fixation    | A fresh token on every sign-in; the old row is deleted                                                         | A token issued before authentication must never survive it.                                                                                                                                                                                                                                        |
| Enumeration         | Sign-in failures are one message for both "no such user" and "wrong password", and both paths do the same work | Different messages or timings turn the form into a list of registered addresses.                                                                                                                                                                                                                   |
| Brute force         | Per-account attempt counter with a lockout window, stored on the user document                                 | No extra datastore, and it is the account being protected, not the IP.                                                                                                                                                                                                                             |

**Where permission is enforced.** In the service layer, never in a route guard or a filtered list:

```
listTasks  → find({ ownerId })
getTask    → findOne({ _id, ownerId })
updateTask → findOneAndUpdate({ _id, ownerId }, …)
deleteTask → findOneAndDelete({ _id, ownerId })
restoreTask→ findOneAndDelete({ token, ownerId })
```

Every query carries `ownerId` in its **filter**, so a task belonging to someone else simply does not match. A UI that only hides other people's tasks is not a permission system: `updateTodo` takes an id, and an id is guessable. The owner comes from the session on the server and is never accepted as an argument.

**A wrong owner returns `NOT_FOUND`, not `FORBIDDEN`.** `FORBIDDEN` confirms the task exists, which tells an attacker their id guess was right. Non-existent and not-yours are deliberately indistinguishable.

**Anonymous use, without a second data path.** The app is usable before signing up: the first visit creates a **guest account** — a real row with a real id — and the session cookie is the only thing tying the visitor to it. Tasks then have a genuine owner from the very first keystroke, and every permission check behaves exactly as it does for a claimed account.

Signing up **claims that same row** by filling in its email and password hash, so tasks created anonymously need no migration at all — their `ownerId` already points at the account. Signing in to an _existing_ account instead adopts the guest's tasks and discards the guest. The alternative, keeping anonymous tasks in `localStorage`, would mean a second storage path, a second set of bugs, and data that does not survive AC7.

Unclaimed guests expire on a TTL index, so abandoned anonymous data does not accumulate. The trade-off is stated plainly in the UI: a guest's tasks live behind one cookie, and creating an account is what makes them durable.

**The seam for real permissions.** `ownerId` is the narrow case of "which principals may act on this record". Roles, sharing or teams later replace that single field with a lookup in the same place — the service layer — without touching a component, because no component ever learns who owns anything.

**What the client is told.** The `User` DTO is `{ id, email, createdAt }`. `passwordHash`, salt, session rows and attempt counters never leave the server, and never enter the Query cache, because the cache is serialised into the HTML (§4.7, vector 3).

---

## 5. Sprint & PR cadence

**Rules that make sprints unblocking.**

1. **`main` is always shippable.** Every PR merges green and leaves the app runnable. No PR parks a broken build behind a flag.
2. **A PR is one reviewable idea**, target ≤ 400 changed lines. If it needs a section header in its own description, split it.
3. **Every PR ships its own tests.** There is no "testing sprint". Sprint 8 adds only the cross-cutting integration flow.
4. **Lanes.** Each PR carries a lane (**A** server/data · **B** UI/interaction · **C** infra/docs). Same-sprint PRs in different lanes have no shared files and can be built concurrently.
5. **Blocked-by is explicit and never crosses forward.** A PR may only depend on merged work.
6. **Commits:** one brief sentence saying what changed, in the imperative. No `type(scope):` prefix and no attribution trailers — the message is for a person, the diff already says where. Squash-merge, so the PR title becomes the commit message.
7. **Branches:** one branch per sprint, `s<sprint>/<slug>` — e.g. `s2/complete-crud`. Each PR in the sprint is a commit on that branch; the branch opens a pull request when the sprint closes, so the whole sprint is reviewed as one coherent change rather than in fragments.
8. **CI gate on every PR:** typecheck → lint → unit/component → build. E2E runs on PRs targeting `main` from Sprint 8 onward.
9. **Definition of Done** (per PR): types pass · tests written and green · keyboard path works · no new axe violations · no `console.log` · **gitleaks clean, no `.env*` in the diff, and nothing added to the Query cache but `Task` and `User` DTOs** (§4.7). From Sprint 3: every database query that reads or writes a task carries `ownerId` in its filter (§4.8).

**Cadence:** 9 sprints, 3 PRs each (27 PRs). Sprints 0–3 are the spine and are sequential — Sprint 3 joins it because ownership touches every query written after it. Sprints 4–6 open parallel lanes. Sprint 8 is the gate.

---

## 6. The sprints

### Sprint 0 — Foundation

_Goal: a repo where the next seven sprints can start on the same afternoon._

| PR                                                           | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1** `Scaffold the TanStack Start app`                    | C    | —          | `git init`. **The first commit contains `.gitignore` with `.env`/`.env.*` already ignored** (§4.7, vector 1) — this lands before any env file can exist. TanStack Start + React 19 + TS strict. Vitest + RTL + Playwright + ESLint + Prettier. GitHub Actions (typecheck·lint·test·build·**gitleaks**) + `pre-commit` secret scan. `PLAN.md` committed.                                                                                                                                                     |
| **0.2** `Add the design tokens and base components`          | B    | 0.1        | `tokens.css` (§4.6 verbatim), self-hosted woff2 for the three families, reset. `Button` (primary/secondary/ghost/danger × hover/focus/disabled/loading), `Field`, `Pill`, `Kbd`, `Skeleton`. Focus ring global. `prefers-reduced-motion` guard. Visual smoke route at `/_dev/components` mirroring the Component Inventory screen.                                                                                                                                                                          |
| **0.3** `Connect to Mongo behind a server-only env boundary` | A    | 0.1        | Native Mongo driver (no ODM — §19 "no generic repository framework"). Cached client across HMR/lambda invocations. Zod-parsed **server-only** `env.ts` that throws at boot on a missing `MONGODB_URI` **and throws at module scope if evaluated in a browser** (§4.7, vector 2). ESLint `no-restricted-imports` fencing `db.ts`/`env.ts` to `*.server.ts` + `task.repo.ts`. `logger.ts` with key-based redaction, `errors.ts` (`AppError` taxonomy + sanitizer). `.env.example` with **placeholders only**. |

**Ships:** a styled empty shell that boots and connects. **Lanes 0.2 ∥ 0.3.**

---

### Sprint 1 — Vertical slice

_Goal: prove the whole architecture on one path before building breadth (system design Phase 2). Closes **AC1, AC2, AC7**._

| PR                                                      | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1** `Define the task schema, types and DTO mapping` | A    | 0.3        | `task.types.ts` (`Task`, `TaskStatus = todo\|doing\|done` per **D2**, `Priority = p1\|p2\|p3`). `task.schema.ts` — one Zod module used by form _and_ server fn. Invariants: title trimmed, 1–200 chars; status closed enum; `dueAt` nullable ISO; **`id`/`createdAt`/`updatedAt` stripped from all inputs**. `task.repo.ts` maps `WithId<Document> → Task` (**Failure Check 5**). Unit tests incl. rejection of unknown fields and unknown status. |
| **1.2** `Add listTodos and createTodo`                  | A    | 1.1        | `createServerFn` boundary. Server-generated `_id` and timestamps. Service layer maps driver errors → `AppError` with **no stack, URI or driver detail crossing the wire**; full context stays in the server log (operation · error class · duration · entity id). Seed script with the design's own demo content (Ship v1 · Docs · Infra · Polish). Server tests: malformed input, unknown status, DB-down → safe error.                           |
| **1.3** `Render the task list from the route loader`    | B    | 1.2        | `tasksQuery = queryOptions({ queryKey:['tasks'], queryFn: () => listTodos() })`. Route loader `ensureQueryData` → SSR + dehydration (**Failure Check 1**: the loader populates the cache, the component reads Query — never both). `TaskList` as a real `<ul>/<li>`. Single-field composer, optimistic create with `tmp_` ids (**D3**), invalidate `['tasks']` on settle.                                                                          |

**Ships:** load → create → **reload → still there**. The spine is proven. **Sequential.**

---

### Sprint 2 — Complete CRUD

_Goal: every mutation, with rollback that actually works. Closes **AC3, AC4**._

| PR                                                    | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.1** `Toggle status optimistically, with rollback` | A→B  | 1.3        | `updateTodo({ id, patch })`, partial-patch schema. `useUpdateTask` — cancel in-flight → snapshot → optimistic write → **rollback on error** → invalidate on settle. Mutation key **per task id** so concurrent row edits don't collide. `Space` advances `todo → doing → done`. Test asserts cache is byte-identical to the snapshot after a forced rejection. |
| **2.2** `Delete a task, undoable for 8 seconds`       | A→B  | 2.1        | `deleteTodo({ id }) → { id, undoToken }`; `restoreTodo({ undoToken })`. Confirm dialog (focus-trapped, **returns focus to the row** on close). Undo toast with live countdown. Optimistic removal retaining enough state to restore (**§7: never optimistic without a rollback path**).                                                                        |
| **2.3** `Build out the task row and inline editing`   | B    | 2.1        | The densest component in the app. Checkbox · title · list chip · due · `StatusPill` · priority · hover actions. **Only the title truncates** — metadata never collapses. Inline title edit (`E` / click): save on blur, `esc` reverts. Pending "Saving…" and completed struck/dimmed states.                                                                   |

**Ships:** full CRUD against a real database, every optimistic path reversible. **2.2 ∥ 2.3 after 2.1.**

---

### Sprint 3 — Accounts and permissions

_Goal: a task belongs to someone, and only they can see or change it. Inserted ahead of every other feature because each sprint that follows would otherwise have to be revisited (**D13**, §4.8)._

| PR                                              | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **3.1** `Add accounts and server-side sessions` | A    | Sprint 2   | `users` and `sessions` collections. scrypt hashing via `node:crypto` with per-password salt and parameters stored alongside the hash; `timingSafeEqual` comparison. Opaque 256-bit session token, **only its SHA-256 stored**, TTL index on `expiresAt`. `signUp` / `signIn` / `signOut` / `me` server functions on the shared Zod schema. Tests: a password is never stored or logged in the clear, a stored hash cannot be reversed to a token, sign-in is indistinguishable for unknown-user and wrong-password, and sign-in issues a new token rather than reusing one.                |
| **3.2** `Scope every task to its owner`         | A    | 3.1        | `ownerId` on `Task`, set from the session and **never accepted as an argument**. `ownerId` in the filter of all five task operations. A wrong owner yields `NOT_FOUND`, not `FORBIDDEN`. Compound index `{ ownerId, createdAt }`. A one-off migration assigns existing demo rows to the first account, and the seed script takes an account. **The load-bearing test: signed in as A, every operation on one of B's task ids fails — list, get, update, delete and restore, by id and by undo token.**                                                                                     |
| **3.3** `Sign in, sign up and sign out`         | B    | 3.1        | `/sign-in` and `/sign-up` on the existing `Field` and `Button` primitives. **No redirect for anonymous visitors** — a guest account makes the app usable immediately, and the account bar states what that means and offers to make it permanent. Account bar with sign-out. Errors are inline, specific and never enumerate accounts. E2E: two accounts in two browser contexts cannot see each other's tasks; sign-out makes the cookie useless immediately; a guest's tasks survive signing up **and** signing in; the session cookie is `HttpOnly` and invisible to `document.cookie`. |

**Ships:** the app has owners, and the URL is no longer the only thing between a stranger and your data.

---

### Sprint 4 — Search, filters, URL state

_Goal: every result set is a link. Closes **AC5, AC6**._

| PR                                                        | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4.1** `Move filters into validated search params`       | A    | 3.2        | Route `validateSearch` for `q · status[] · due · sort` — malformed params **fall back, never crash**. `task.filters.ts`: pure `filterTasks` / `sortTasks` / `groupByDue` (Overdue · Today · Later this week · Completed). Server-side equivalents in `listTodos` per **D4**, tested at the boundary. Heavy unit coverage — this is the highest-value pure-function surface in the app. |
| **4.2** `Add the search field and filter panel`           | B    | 4.1, 2.3   | `SearchInput`: **120ms debounce**, every keystroke cancellable, `/` focuses from anywhere, `esc` clears then blurs. Matches title, notes and list name. Status/due/list filter panel with live counts, active-filter chips, Clear all. Result count → polite live region. "N completed tasks also match but are hidden — Include Done". Keystroke → repaint budget **< 50ms**.         |
| **4.3** `Group and sort results, and handle both empties` | B    | 4.2        | Date group headers with counts. Sort by due/created/relevance. The two distinct empties: _first run_ ("Nothing here yet") vs _no matches_ ("Two filters are narrowing this search…" + Clear filters / Create "q"). Per **§12, an empty list is not an error.**                                                                                                                         |

**Ships:** `/?q=focus&status=todo,doing&due=week` is shareable, reload-safe, and Back/Forward behave.

---

### Sprint 5 — Command palette & keyboard

_Goal: everything the mouse can do, the keyboard can do first._

| PR                                                 | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5.1** `Add the command registry and key map`     | A    | 3.3        | `palette.ts` registry + `shortcuts.ts` scoped key map (§4.5). **Shortcuts disabled inside input/textarea/contenteditable — except `esc` and `⌘↵`.** `⌘` renders as `Ctrl` on Windows/Linux, **resolved per platform, not hard-coded**. Never overrides browser/SR combos. Selection model (`useSelection`) + contextual number keys: row selected → sets status; nothing selected → filters. |
| **5.2** `Build the command palette`                | B    | 5.1        | `⌘K` opens. **Combobox with `aria-activedescendant`; focus never leaves the input.** Scopes `>` commands · `#` lists · `!` priority (`⇥` cycles). Fuzzy, recent-first. `↵` run · `⌘↵` run and keep open · `esc` closes **and restores focus to the trigger**. Fallback row: "Press ↵ to create a task called _q_". Open→focused budget **< 100ms**.                                          |
| **5.3** `Finish the keyboard map and help overlay` | B    | 5.2        | The remaining 31 bindings: `N` `/` `?` `↑↓` `←→` `↵` `esc`-cascade (panel → search → selection), `G I`/`G T`/`G B`, `1 2 3`, `E`, `⌘D` duplicate, `⌘⌫`, `⇧→`, `D`, `A`, `⇧C`, `⇧⌘X`, `V`. `?` opens the keyboard-map overlay. Mode hint strip. **Nothing is keyboard-only** — every shortcut has a visible control, every control shows its key on hover.                                    |

**Ships:** the app is fully drivable without a pointer. **Runs ∥ Sprint 6.**

---

### Sprint 6 — Detail route & board

_Goal: the two remaining routes, keyboard-first._

| PR                                           | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6.1** `Add the task detail panel`          | B    | 3.2        | Pathless `_list` layout (§4.2) — **list stays mounted**. Title · status · due · priority · list · notes. Edits save on blur, `esc` reverts, "Saved 2s ago". Deep-linkable and refresh-safe; `esc` closes and returns focus to the originating row. Per-field pending state, never a panel-wide spinner.                                           |
| **6.2** `Add the board, movable by keyboard` | B    | 5.1, 2.1   | `/board` route. To do · In progress · Done columns with counts, dot + heading (**status never colour alone**). `←→` between columns, `⇧→` moves a card to the next status, `Space` pick up / drop. **Built before pointer DnD so the keyboard path is the contract, not a retrofit** (**D11**). Reuses `useUpdateTask` — no second mutation path. |
| **6.3** `Add drag-and-drop to the board`     | B    | 6.2        | Drop zones ("Drop here to set status → To do"), drag affordances, 240ms row-removal motion. **Droppable if the schedule tightens** — 5.2 already satisfies the AC and the a11y contract.                                                                                                                                                          |

---

### Sprint 7 — States, accessibility, responsive

_Goal: the six screens that decide whether the app feels trustworthy._

| PR                                                  | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7.1** `Add the loading, error and failure states` | B    | 4.3        | Skeletons that **match real row geometry exactly** and appear only **after 200ms** — faster responses go straight to content and never flash. Route-level error boundary with retry. Mutation-failure toast in the design's mandated order — _what happened · what the app did · what you can do next_ — with Retry and Copy error id. **Never a bare "Something went wrong".** Background refetch preserves the existing list. |
| **7.2** `Accessibility pass`                        | B    | 7.1, 5.3   | Real `<button>`s; `<label>`s associated; icon-only buttons carry `aria-label`. Focus visible everywhere, logical tab order. Dialogs trap and return focus. Result counts and save outcomes → polite live region. Contrast audit against §4.6 floors. `vitest-axe` on every component suite + Playwright axe on each route; **CI fails on new violations**. Keyboard-only traversal test that never touches the mouse.           |
| **7.3** `Add the mobile list and action sheet`      | B    | 7.1        | Sidebar → bottom nav (Inbox · Today · Board · Actions). Horizontal status filter strip. Palette becomes a **sheet**: same command registry, 48px targets, no keyboard required. Swipe-to-done with a visible equivalent. Fluid down to 360px.                                                                                                                                                                                   |

---

### Sprint 8 — Integration, docs, deploy

_Goal: a reviewer runs it in five minutes._

| PR                                           | Lane | Blocked by | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8.1** `Cover the critical path end to end` | C    | 7.2        | The one high-value flow, exactly as system design §16 specifies: **load → create → update status → search → filter → delete → undo → reload → verify persisted.** Runs against a real Mongo (ephemeral Atlas DB or `mongodb-memory-server` in CI). Plus a keyboard-only variant of the same flow. Added to the `main` CI gate.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **8.2** `Harden for production`              | A    | 7.1        | **The §4.7 build-output assertion**: grep all built client JS/CSS/source maps **and the SSR'd HTML** for the live `MONGODB_URI`, its host, its password and every `env.ts` key — any hit fails CI. `git log -p -- '.env*'` asserted empty across full history. Every server fn re-checked for validation + sanitized errors; **no Mongo operator ever constructed from user input**; `q` escaped for regex; **Boot the built artifact and request a page** -- `.output/server/index.mjs`, one 200 with markup, one server function round trip. The cheapest test in the suite and the only one that would have caught either deployment failure (§9). bundle budget — **route JS gzipped < 120 KB**; Lighthouse first-paint **< 1.0s**.             |
| **8.3** `Write the README and deploy`        | C    | 8.1        | README: 5-minute setup, `.env.example`, seed command, architecture summary, **§3's decision table**, the "designed but not built" list with reasons, testing notes, AC→PR traceability from §2, and a **credential-rotation procedure**. Atlas: least-privilege `readWrite` user scoped to one DB, IP allowlist, **separate credentials for preview vs production**. Deploy with `MONGODB_URI` in the host's encrypted server-side env — never in `vercel.json`, a committed config, or a build arg. **The deploy target itself landed early, out of sprint order**, because the hosted app was returning 404 on every path and nothing in the plan had assigned the work. README states plainly that the Atlas access list is open and why (§4.7). |

---

## 7. Parallelization map

```
S0 ─► S1 ─► S2 ─► S3 ──┬──► S4 ──┬──► S7 ─► S8
                      │         │
                      └──► S5 ──┴──► S6
```

- **S0–S3 are the spine.** Sequential. Sprint 3 belongs here because `ownerId` enters the filter of every task query: a sprint written before it would have to be rewritten after it.
- **S4 ∥ S5** after Sprint 3 — filters touch `task.filters.ts` + toolbar; the palette touches `shortcuts.ts` + `palette.ts`. Disjoint files.
- **S6 joins** once 5.1 (registry) and 2.1 (update mutation) are merged; the board consumes both rather than reimplementing either.
- **S7 needs both** interaction sprints merged, because the a11y pass audits what exists.
- **Within a sprint**, different-lane PRs are concurrent — flagged per row above.

**Droppable under schedule pressure, in order:** 6.3 (pointer DnD) → 5.3 partial (keep `N`, `/`, `esc`, `↵`, `1 2 3`) → 7.3 (mobile) → 6.2 (board). Everything through Sprint 4 plus 7.1/7.2 and Sprint 8 is the non-negotiable floor — that set alone closes all seven ACs. **Sprint 3 is not droppable**: the app is publicly reachable, and shipping it without owners is shipping an open database.

---

## 8. Verification

**Per PR (CI):** `npm run typecheck && npm run lint && npm run test && npm run build`

**Layered tests** (system design §16 — contracts, not coverage percentage):

- **Unit** — `task.schema` validation · `filterTasks`/`sortTasks`/`groupByDue` · status transitions · title normalization · `task.parse` composer tokens · platform key resolution.
- **Server** — create rejects malformed input · update rejects unknown status · delete handles a missing task · **DB errors map to safe application errors that leak no URI, stack or driver detail** · `q` cannot inject a Mongo operator · importing `env.ts` from a client module fails the build.
- **Secrets (CI, every PR)** — `gitleaks` over the diff and full history · no `.env*` tracked · built client output and SSR'd HTML contain no value from `env.ts` (§4.7).
- **Component** — composer validation · inline edit · filter behaviour · both empty states · **mutation error rolls the cache back to the exact snapshot** · palette keyboard interaction and focus return · axe on every component.
- **Integration (7.1)** — the single critical path, pointer and keyboard-only variants.
- **The built artifact (8.2)** — boot `.output/server/index.mjs` and request a page. Every layer above this tests source: unit tests import modules directly and Playwright drives `vite dev`. Nothing among them ever loads the bundle that actually ships, which is how a build that passed every check reached a deployment and failed on its first database call (see §9).

**Manual acceptance, run before calling it done:**

1. `npm run seed && npm run dev` → list paints from SSR. **Disable JS → the list still renders** (proves loader-backed SSR).
2. Create via composer → row appears instantly with a temp id → id swaps on confirm. Reload → present. _(AC1, AC7)_
3. Toggle status with `Space` → pill flips in **< 16ms**. _(AC3, AC6)_
4. Point `MONGODB_URI` at a dead host → mutate → row rolls back, toast offers Retry, **and the browser sees no connection string**. _(§12, §15)_
5. `/` → type → results in **< 50ms**, count announced. Copy `/?q=focus&status=todo,doing&due=week` into a fresh tab → identical view. Back → unfiltered. _(AC5, AC6)_
6. `⌘⌫` → confirm → undo toast → Undo → task returns. Repeat without undo → reload → gone. _(AC4, AC7)_
7. **Unplug the mouse.** Complete the entire flow — create, edit, filter, board-move, delete, undo — with the keyboard only.
8. Screen reader: result counts and save outcomes announce; the palette announces the highlighted row; every dialog returns focus to its trigger.
9. 360px viewport: no horizontal scroll, 48px touch targets, palette opens as a sheet.
10. `prefers-reduced-motion: reduce` → **nothing animates**.
11. **Two accounts, two browsers.** Sign in as A in one, B in the other. Neither sees the other's tasks. Copy a task id from A's network tab and attempt update and delete as B: both fail, and the failure is indistinguishable from a task that was never there. Sign out in A; the old cookie is refused.
12. **Secrets, by hand on the deployed app** (§4.7): View Source and search the HTML for the cluster host — nothing. Search every loaded JS asset and the dehydrated `__TSR__`/Query state payload — nothing. `process.env` and `import.meta.env` in the browser console expose no connection string. Then `git log --all -p -- '.env*'` → empty across the entire history.

---

## 9. Risks

| Risk                                                             | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The seven ACs in §2 are reconstructed, not given                 | They lead the plan and the README. A correction reshuffles the traceability column, not the sprints.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| TanStack Start's server-fn / SSR API surface is still moving     | Pin exact versions in 0.1. Sprint 1 is deliberately a thin end-to-end slice so any API surprise surfaces on day one, not in Sprint 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Scope is large for a take-home                                   | §7's drop order is pre-agreed, and `main` is shippable after every PR — the build can stop at any sprint boundary and still demo a coherent product.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Natural-language date parsing (`tomorrow 4pm`) can sprawl        | One small dependency (`chrono-node`), resolved client-side to an exact ISO instant, behind `task.parse.ts` with its own tests. If it misbehaves, the full form still sets dates and the composer degrades to plain titles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Optimistic paths diverging from the server (**Failure Check 2**) | Every optimistic mutation ships with a rollback test in the same PR. Per-task-id mutation keys prevent the update-then-delete race in **Failure Check 6**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Design fidelity competing with correctness                       | Sprints 0–6 build correctness in the design's token system; polish is Sprint 7+. Per system design §20, animation and micro-interaction come **only after** correctness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **A build that passes every check and fails on the host**        | Happened. The app shipped with no deploy target, so `vite build` produced client assets and a server bundle but **no HTML** -- and a host serving that directory 404s every path while still reporting a successful deploy. Adding the nitro target then exposed a second failure only the built artifact could show: the bundled Mongo driver resolved its conditional `require('crypto')` to WebCrypto and refused to authenticate ("Node.js crypto module is required for SCRAM-SHA-1 authentication"). The driver is external and traced intact now. Both were invisible to 244 unit tests and 76 Playwright tests, because **neither layer ever loads the bundle that ships** -- hence the artifact smoke test added to §8. |
| **The E2E suite writing to the real database**                   | Happened twice. First, Playwright's `webServer.env` was overridden by Vite loading `.env`; fixed with `--mode e2e` and an ignored `.env.e2e`. Second, `reuseExistingServer` silently adopted a developer's `npm run dev` still listening on 3000 — mode and database included. Now the suite runs on its own port (3001, strict) and never reuses a server: a collision fails loudly instead of misdirecting writes. Verified by counting guests per database after a run — the check that caught it, and the one to repeat if a run ever looks green too easily.                                                                                                                                                                |
| **A credential reaching the repo or the browser**                | Four independent guards, none relying on discipline (§4.7): `.gitignore` in the _first_ commit + gitleaks in CI and pre-commit; no `VITE_` prefix + a browser-throwing `env.ts` + an ESLint import fence; DTO-only Query cache so nothing else is serialized into the SSR payload; and a CI assertion that greps the built client output and HTML for every env value. The SSR-payload vector is the subtle one — the loader dehydrates the cache **into the HTML**, so cache hygiene is a secrecy control here, not just a coupling one.                                                                                                                                                                                        |

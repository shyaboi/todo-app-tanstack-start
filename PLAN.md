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

**Standing principle.** *When in doubt about design, follow TanStack/React component design best patterns — no anti-patterns.* Where the design docs and idiomatic TanStack disagree, idiom wins and the deviation gets a line in §3.

---

## 2. Assumed acceptance criteria

The FE design cites "the seven acceptance criteria" and maps server functions to them, but the rubric text was not supplied. Reconstructed from the architecture screen's own mapping (`listTodos → AC 2·5·6`, `createTodo → AC 1`, `updateTodo → AC 3·6`, `deleteTodo → AC 4`):

| AC | Statement | Primary server fn | Proven by |
|----|-----------|-------------------|-----------|
| **AC1** | Create a task | `createTodo` | Sprint 1 · E2E step 2 |
| **AC2** | View the list of tasks | `listTodos` | Sprint 1 · E2E step 1 |
| **AC3** | Edit a task (title and fields) | `updateTodo` | Sprint 2 · E2E step 3 |
| **AC4** | Delete a task | `deleteTodo` | Sprint 2 · E2E step 6 |
| **AC5** | Search tasks by text | `listTodos({ q })` | Sprint 3 · E2E step 4 |
| **AC6** | Filter tasks by status | `listTodos({ status })` + `updateTodo` | Sprint 3 · E2E step 5 |
| **AC7** | Changes persist across reload (real database) | all | Sprint 1 · E2E step 7 |

> ⚠️ **These are reconstructed, not given.** Every sprint goal below is written against this table. If the real rubric differs, the sprint *contents* barely change — only the traceability column does.

---

## 3. Source-of-truth reconciliation

Each row is a real conflict between the two supplied documents, and the call taken. This table becomes a "Design decisions" section in the README.

| # | Conflict | Resolution | Rationale |
|---|----------|-----------|-----------|
| **D1** | System design: `title, status` only. FE design: `+ notes, dueAt, priority, listId, assignee, subtasks, activity`. | **Core + `notes`, `dueAt`, `priority`, `listId`.** Assignee, subtasks and activity log are **cut**. | The kept fields are what the composer, row, filters, sort and grouping actually consume. The cut fields all imply a *user* concept, which the system design lists as an explicit non-goal (§19). |
| **D2** | System design §5: status is `'todo' \| 'in-progress' \| 'done'`. FE design: "One of `todo · doing · done`", and the URL example is `?status=todo,doing`. | **`todo \| doing \| done`** on the wire and in the DB. Display labels stay "To do / In progress / Done". | The FE design's is URL-safe and appears in a literal search-param example. Persisting a display string is the anti-pattern here. |
| **D3** | System design §7: "I prefer **pending UI + server reconciliation** for creation because the database owns the real ID." FE design: "The row appears the instant you press ↵, with a temporary id." | **Optimistic create with deliberate temp-id handling.** | Not actually a conflict — §7 permits optimism "only if temporary IDs are handled deliberately". The FE design specifies the full contract including the reject path (row slides out, error toast with Retry), so the bar is met. Temp ids are namespaced `tmp_*` and are never sent to the server. |
| **D4** | System design §10: filtering stays **client-side**. FE design: "Search and status filtering run on the **server** for the initial render and in the cache for keystrokes." | **One canonical `['tasks']` query holding the unfiltered list; all filtering derived at render.** `listTodos` still *accepts and applies* validated `{ q, status[], due, sort }` server-side, fully tested — but the app calls it unfiltered. | Derived filtering is the system design's stated position for this dataset size and is what Failure Checks 1 and 7 demand. Keying the query by filters would thrash the cache on every keystroke. Implementing the server-side filter anyway keeps the documented §22 scaling seam real and gives AC5/AC6 a server-boundary test, at near-zero cost. |
| **D5** | FE design lists `view` as a **URL search param** *and* `board.tsx` as a **route** *and* `lastView` as a **device preference** — three owners for one value. | **`/` and `/board` are routes.** `lastView` lives in `localStorage` and only decides where a bare visit lands. **No `view` search param.** | This is Failure Check 7 ("Filter State Drift") in the design's own docs. Routes give code-splitting and distinct loaders; one owner, no drift. |
| **D6** | FE design shows a full offline write queue, a queue-depth badge, and a "Synced · works offline" chip. System design §19: "no service workers / offline sync". | **Cut.** The chip is **removed**, not faked. | A badge that claims durability the app does not have is worse than no badge. Called out in the README as the single largest intentional gap. |
| **D7** | FE design shows concurrent-edit conflict resolution ("Rae edited this task while you were typing · Keep mine / Take theirs"). | **Cut.** | Requires multi-user + revision fields; system design §22 files both under future scaling. |
| **D8** | FE design shows task refs like `TSK-118`. MongoDB yields `ObjectId`. | DTO exposes `id` as an opaque hex string (Failure Check 5). The UI renders a **derived** display ref: `TSK-` + last 4 hex of `id`, uppercased. | Visually faithful with no counter collection and no extra write on the create path. Noted as a cosmetic deviation. |
| **D9** | FE design composer parses `#list @person !p1 ~doing tomorrow 4pm`. | `#list`, `!p1..p3`, `~status` and dates ship. **`@person` is cut** (follows D1). | Dates resolve **client-side to an exact ISO instant** before the request, exactly as the design's validation contract specifies. |
| **D10** | Keyboard map includes `⌘Z` / `⇧⌘Z` undo–redo. | **Only delete is undoable**, via `restoreTodo({ undoToken })` and the 8-second toast. A general undo stack is cut. | A real undo stack is a command-history architecture; the design only ever *shows* undo on the delete path. |
| **D11** | Board shows pointer drag-and-drop with a WIP limit. | Keyboard card movement (`⇧→`, `Space` pick up/drop) ships **first and is the contract**; pointer DnD is the last PR of its sprint and is droppable. WIP limit is cut. | The design's own accessibility contract says DnD must have a full keyboard equivalent. Building the keyboard path first guarantees it isn't retrofitted. |
| **D12** | "Saved views" (`⇧1…3`) in the filter panel. | **Cut.** | It is a persistence feature wearing a filter costume; no AC touches it. |

**Explicitly designed but not built** (README section, so nothing reads as an oversight): assignees/people · subtasks · activity log · offline queue · conflict resolution · saved views · undo/redo stack · board WIP limits · "Load sample list" button (replaced by the seed script) · recent searches.

---

## 4. Architecture

### 4.1 State ownership — one owner per value

| State | Owner | Notes |
|---|---|---|
| Persistent task data | MongoDB | Server owns `id`, `createdAt`, `updatedAt` |
| Client mirror of server data | TanStack Query, key `['tasks']` | The **only** server-state cache |
| `q` · `status` · `due` · `sort` | Router search params, Zod-validated | Every result set is a link |
| Composer draft · palette query · row selection | Local React state | Losing it on reload is correct |
| `lastView` · `showCompleted` · `density` | `localStorage` | Never in a link, never sent to the server |

Per system design §2: no Zustand, Redux, Context-as-store, or TanStack DB.

### 4.2 Routes

```
routes/
├── __root.tsx                  shell · command palette · toast host · aria-live region
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

No `useEffect` fetching anywhere. The router decides *when* data is needed; Query owns its lifecycle.

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
--surface:#FFFFFF  --canvas:#FBFAF7  --sunken:#F4F3EF  --hairline:#EDECE7
--border:#DFDDD5   --meta:#767267    --secondary:#57544B --ink:#1B1A16

/* Rust — action & in-progress */
--rust-50:#FBF2EE --rust-100:#F8E5DC --rust-200:#EBCBBC --rust-400:#C9856A
--rust-600:#A8462A --rust-700:#96401F --rust-800:#7A3A1E

/* Pine — done & confirmed */
--pine-50:#F2F7F4 --pine-100:#DCE9E2 --pine-200:#C3D9CC
--pine-400:#5C8B78 --pine-600:#275C4C --pine-700:#1D463A
```

- **Type** — Instrument Serif (display only) · Hanken Grotesk (everything read) · JetBrains Mono (keys, ids). Scale: display 40/44 · title1 24/30 · title2 18/24 · body 15/22 · row 14.5/20 · small 13/18 · micro 11/14 · mono 12/16.
- **Spacing** 4px base: 4·8·12·16·20·24·32·40·64. **Radius** 6 kbd · 9 control · 11 row · 14 panel · pill(999). **Controls** 44px default height (48px touch).
- **Focus** 2px ring, 2px offset, drawn on ink. *Never removed — only restyled.*
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
- **No secret ever gets a `VITE_` prefix.** Vite statically inlines every `VITE_*` variable into browser assets; the prefix *is* the publication mechanism. `MONGODB_URI` and friends stay unprefixed and are read only through `process.env` inside server modules.
- `src/server/env.ts` is server-only and **throws at module scope if it is ever evaluated in a browser context**, so a stray client import fails loudly at build/dev time instead of silently shipping.
- Import discipline: `db.ts` and `env.ts` are imported **only** by `*.server.ts` / `task.repo.ts`. An ESLint `no-restricted-imports` rule enforces this — component and route files cannot reach them, so there is no module graph along which a secret can travel to the browser.

**Leak vector 3 — serialized into the SSR payload.** *(architecture-specific, and the easiest one to miss)*
- The route loader dehydrates the Query cache **into the HTML**. Anything placed in the cache server-side is delivered to the browser in plain text.
- Therefore: **only mapped `Task` DTOs ever enter the cache.** No config objects, no raw driver results, no `env`, no request context. This is the same rule as Failure Check 5, now load-bearing for secrecy as well as for coupling.

**Leak vector 4 — echoed through errors or logs.**
- `errors.ts` sanitizes at the boundary: the client receives a stable `AppError` code and human-readable message. Stack traces, connection strings, driver internals and `process.env` never cross the wire (§12, §15).
- The server logger redacts by key (`uri`, `password`, `token`, `secret`, `authorization`) and logs only operation · error class · duration · entity id.

**In the deployed environment.**
- `MONGODB_URI` is set in the host's encrypted environment settings as a **server-side-only** variable — never in `vercel.json`, never in a committed config, never in build args that echo to logs.
- **Preview and production use separate Atlas database users** with distinct credentials, so a leaked preview credential cannot touch production data.
- The Atlas user holds **least privilege**: `readWrite` on the single application database, nothing cluster-wide. IP allowlist restricted to the deployment platform.
- Rotation procedure is one line in the README, on the assumption that a credential *will* eventually need rotating.

**The assertion that proves it (PR 7.2).** After `npm run build`, a test greps the entire built client output — JS, CSS, source maps, and the SSR'd HTML — for the live `MONGODB_URI`, its host, its password, and every key in `env.ts`. **Any hit fails the build.** This runs in CI, so the guarantee is verified on every PR rather than assumed.

---

## 5. Sprint & PR cadence

**Rules that make sprints unblocking.**

1. **`main` is always shippable.** Every PR merges green and leaves the app runnable. No PR parks a broken build behind a flag.
2. **A PR is one reviewable idea**, target ≤ 400 changed lines. If it needs a section header in its own description, split it.
3. **Every PR ships its own tests.** There is no "testing sprint". Sprint 7 adds only the cross-cutting integration flow.
4. **Lanes.** Each PR carries a lane (**A** server/data · **B** UI/interaction · **C** infra/docs). Same-sprint PRs in different lanes have no shared files and can be built concurrently.
5. **Blocked-by is explicit and never crosses forward.** A PR may only depend on merged work.
6. **Commits:** one brief sentence saying what changed, in the imperative. No `type(scope):` prefix and no attribution trailers — the message is for a person, the diff already says where. Squash-merge, so the PR title becomes the commit message.
7. **Branches:** `s<sprint>/<lane>-<slug>` — e.g. `s2/b-task-row-anatomy`.
8. **CI gate on every PR:** typecheck → lint → unit/component → build. E2E runs on PRs targeting `main` from Sprint 7 onward.
9. **Definition of Done** (per PR): types pass · tests written and green · keyboard path works · no new axe violations · no `console.log` · **gitleaks clean, no `.env*` in the diff, and nothing added to the Query cache but `Task` DTOs** (§4.7).

**Cadence:** 8 sprints, 3 PRs each (24 PRs). Sprints 0–2 are the spine and are sequential. Sprints 3–5 open parallel lanes. Sprint 7 is the gate.

---

## 6. The sprints

### Sprint 0 — Foundation
*Goal: a repo where the next seven sprints can start on the same afternoon.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **0.1** `Scaffold the TanStack Start app` | C | — | `git init`. **The first commit contains `.gitignore` with `.env`/`.env.*` already ignored** (§4.7, vector 1) — this lands before any env file can exist. TanStack Start + React 19 + TS strict. Vitest + RTL + Playwright + ESLint + Prettier. GitHub Actions (typecheck·lint·test·build·**gitleaks**) + `pre-commit` secret scan. `PLAN.md` committed. |
| **0.2** `Add the design tokens and base components` | B | 0.1 | `tokens.css` (§4.6 verbatim), self-hosted woff2 for the three families, reset. `Button` (primary/secondary/ghost/danger × hover/focus/disabled/loading), `Field`, `Pill`, `Kbd`, `Skeleton`. Focus ring global. `prefers-reduced-motion` guard. Visual smoke route at `/_dev/components` mirroring the Component Inventory screen. |
| **0.3** `Connect to Mongo behind a server-only env boundary` | A | 0.1 | Native Mongo driver (no ODM — §19 "no generic repository framework"). Cached client across HMR/lambda invocations. Zod-parsed **server-only** `env.ts` that throws at boot on a missing `MONGODB_URI` **and throws at module scope if evaluated in a browser** (§4.7, vector 2). ESLint `no-restricted-imports` fencing `db.ts`/`env.ts` to `*.server.ts` + `task.repo.ts`. `logger.ts` with key-based redaction, `errors.ts` (`AppError` taxonomy + sanitizer). `.env.example` with **placeholders only**. |

**Ships:** a styled empty shell that boots and connects. **Lanes 0.2 ∥ 0.3.**

---

### Sprint 1 — Vertical slice
*Goal: prove the whole architecture on one path before building breadth (system design Phase 2). Closes **AC1, AC2, AC7**.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **1.1** `Define the task schema, types and DTO mapping` | A | 0.3 | `task.types.ts` (`Task`, `TaskStatus = todo\|doing\|done` per **D2**, `Priority = p1\|p2\|p3`). `task.schema.ts` — one Zod module used by form *and* server fn. Invariants: title trimmed, 1–200 chars; status closed enum; `dueAt` nullable ISO; **`id`/`createdAt`/`updatedAt` stripped from all inputs**. `task.repo.ts` maps `WithId<Document> → Task` (**Failure Check 5**). Unit tests incl. rejection of unknown fields and unknown status. |
| **1.2** `Add listTodos and createTodo` | A | 1.1 | `createServerFn` boundary. Server-generated `_id` and timestamps. Service layer maps driver errors → `AppError` with **no stack, URI or driver detail crossing the wire**; full context stays in the server log (operation · error class · duration · entity id). Seed script with the design's own demo content (Ship v1 · Docs · Infra · Polish). Server tests: malformed input, unknown status, DB-down → safe error. |
| **1.3** `Render the task list from the route loader` | B | 1.2 | `tasksQuery = queryOptions({ queryKey:['tasks'], queryFn: () => listTodos() })`. Route loader `ensureQueryData` → SSR + dehydration (**Failure Check 1**: the loader populates the cache, the component reads Query — never both). `TaskList` as a real `<ul>/<li>`. Single-field composer, optimistic create with `tmp_` ids (**D3**), invalidate `['tasks']` on settle. |

**Ships:** load → create → **reload → still there**. The spine is proven. **Sequential.**

---

### Sprint 2 — Complete CRUD
*Goal: every mutation, with rollback that actually works. Closes **AC3, AC4**.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **2.1** `Toggle status optimistically, with rollback` | A→B | 1.3 | `updateTodo({ id, patch })`, partial-patch schema. `useUpdateTask` — cancel in-flight → snapshot → optimistic write → **rollback on error** → invalidate on settle. Mutation key **per task id** so concurrent row edits don't collide. `Space` advances `todo → doing → done`. Test asserts cache is byte-identical to the snapshot after a forced rejection. |
| **2.2** `Delete a task, undoable for 8 seconds` | A→B | 2.1 | `deleteTodo({ id }) → { id, undoToken }`; `restoreTodo({ undoToken })`. Confirm dialog (focus-trapped, **returns focus to the row** on close). Undo toast with live countdown. Optimistic removal retaining enough state to restore (**§7: never optimistic without a rollback path**). |
| **2.3** `Build out the task row and inline editing` | B | 2.1 | The densest component in the app. Checkbox · title · list chip · due · `StatusPill` · priority · hover actions. **Only the title truncates** — metadata never collapses. Inline title edit (`E` / click): save on blur, `esc` reverts. Pending "Saving…" and completed struck/dimmed states. |

**Ships:** full CRUD against a real database, every optimistic path reversible. **2.2 ∥ 2.3 after 2.1.**

---

### Sprint 3 — Search, filters, URL state
*Goal: every result set is a link. Closes **AC5, AC6**.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **3.1** `Move filters into validated search params` | A | 1.3 | Route `validateSearch` for `q · status[] · due · sort` — malformed params **fall back, never crash**. `task.filters.ts`: pure `filterTasks` / `sortTasks` / `groupByDue` (Overdue · Today · Later this week · Completed). Server-side equivalents in `listTodos` per **D4**, tested at the boundary. Heavy unit coverage — this is the highest-value pure-function surface in the app. |
| **3.2** `Add the search field and filter panel` | B | 3.1, 2.3 | `SearchInput`: **120ms debounce**, every keystroke cancellable, `/` focuses from anywhere, `esc` clears then blurs. Matches title, notes and list name. Status/due/list filter panel with live counts, active-filter chips, Clear all. Result count → polite live region. "N completed tasks also match but are hidden — Include Done". Keystroke → repaint budget **< 50ms**. |
| **3.3** `Group and sort results, and handle both empties` | B | 3.2 | Date group headers with counts. Sort by due/created/relevance. The two distinct empties: *first run* ("Nothing here yet") vs *no matches* ("Two filters are narrowing this search…" + Clear filters / Create "q"). Per **§12, an empty list is not an error.** |

**Ships:** `/?q=focus&status=todo,doing&due=week` is shareable, reload-safe, and Back/Forward behave.

---

### Sprint 4 — Command palette & keyboard
*Goal: everything the mouse can do, the keyboard can do first.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **4.1** `Add the command registry and key map` | A | 2.2 | `palette.ts` registry + `shortcuts.ts` scoped key map (§4.5). **Shortcuts disabled inside input/textarea/contenteditable — except `esc` and `⌘↵`.** `⌘` renders as `Ctrl` on Windows/Linux, **resolved per platform, not hard-coded**. Never overrides browser/SR combos. Selection model (`useSelection`) + contextual number keys: row selected → sets status; nothing selected → filters. |
| **4.2** `Build the command palette` | B | 4.1 | `⌘K` opens. **Combobox with `aria-activedescendant`; focus never leaves the input.** Scopes `>` commands · `#` lists · `!` priority (`⇥` cycles). Fuzzy, recent-first. `↵` run · `⌘↵` run and keep open · `esc` closes **and restores focus to the trigger**. Fallback row: "Press ↵ to create a task called *q*". Open→focused budget **< 100ms**. |
| **4.3** `Finish the keyboard map and help overlay` | B | 4.2 | The remaining 31 bindings: `N` `/` `?` `↑↓` `←→` `↵` `esc`-cascade (panel → search → selection), `G I`/`G T`/`G B`, `1 2 3`, `E`, `⌘D` duplicate, `⌘⌫`, `⇧→`, `D`, `A`, `⇧C`, `⇧⌘X`, `V`. `?` opens the keyboard-map overlay. Mode hint strip. **Nothing is keyboard-only** — every shortcut has a visible control, every control shows its key on hover. |

**Ships:** the app is fully drivable without a pointer. **Runs ∥ Sprint 5.**

---

### Sprint 5 — Detail route & board
*Goal: the two remaining routes, keyboard-first.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **5.1** `Add the task detail panel` | B | 2.3 | Pathless `_list` layout (§4.2) — **list stays mounted**. Title · status · due · priority · list · notes. Edits save on blur, `esc` reverts, "Saved 2s ago". Deep-linkable and refresh-safe; `esc` closes and returns focus to the originating row. Per-field pending state, never a panel-wide spinner. |
| **5.2** `Add the board, movable by keyboard` | B | 4.1, 2.1 | `/board` route. To do · In progress · Done columns with counts, dot + heading (**status never colour alone**). `←→` between columns, `⇧→` moves a card to the next status, `Space` pick up / drop. **Built before pointer DnD so the keyboard path is the contract, not a retrofit** (**D11**). Reuses `useUpdateTask` — no second mutation path. |
| **5.3** `Add drag-and-drop to the board` | B | 5.2 | Drop zones ("Drop here to set status → To do"), drag affordances, 240ms row-removal motion. **Droppable if the schedule tightens** — 5.2 already satisfies the AC and the a11y contract. |

---

### Sprint 6 — States, accessibility, responsive
*Goal: the six screens that decide whether the app feels trustworthy.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **6.1** `Add the loading, error and failure states` | B | 3.3 | Skeletons that **match real row geometry exactly** and appear only **after 200ms** — faster responses go straight to content and never flash. Route-level error boundary with retry. Mutation-failure toast in the design's mandated order — *what happened · what the app did · what you can do next* — with Retry and Copy error id. **Never a bare "Something went wrong".** Background refetch preserves the existing list. |
| **6.2** `Accessibility pass` | B | 6.1, 4.3 | Real `<button>`s; `<label>`s associated; icon-only buttons carry `aria-label`. Focus visible everywhere, logical tab order. Dialogs trap and return focus. Result counts and save outcomes → polite live region. Contrast audit against §4.6 floors. `vitest-axe` on every component suite + Playwright axe on each route; **CI fails on new violations**. Keyboard-only traversal test that never touches the mouse. |
| **6.3** `Add the mobile list and action sheet` | B | 6.1 | Sidebar → bottom nav (Inbox · Today · Board · Actions). Horizontal status filter strip. Palette becomes a **sheet**: same command registry, 48px targets, no keyboard required. Swipe-to-done with a visible equivalent. Fluid down to 360px. |

---

### Sprint 7 — Integration, docs, deploy
*Goal: a reviewer runs it in five minutes.*

| PR | Lane | Blocked by | Contents |
|----|------|-----------|----------|
| **7.1** `Cover the critical path end to end` | C | 6.2 | The one high-value flow, exactly as system design §16 specifies: **load → create → update status → search → filter → delete → undo → reload → verify persisted.** Runs against a real Mongo (ephemeral Atlas DB or `mongodb-memory-server` in CI). Plus a keyboard-only variant of the same flow. Added to the `main` CI gate. |
| **7.2** `Harden for production` | A | 6.1 | **The §4.7 build-output assertion**: grep all built client JS/CSS/source maps **and the SSR'd HTML** for the live `MONGODB_URI`, its host, its password and every `env.ts` key — any hit fails CI. `git log -p -- '.env*'` asserted empty across full history. Every server fn re-checked for validation + sanitized errors; **no Mongo operator ever constructed from user input**; `q` escaped for regex; bundle budget — **route JS gzipped < 120 KB**; Lighthouse first-paint **< 1.0s**. |
| **7.3** `Write the README and deploy` | C | 7.1 | README: 5-minute setup, `.env.example`, seed command, architecture summary, **§3's decision table**, the "designed but not built" list with reasons, testing notes, AC→PR traceability from §2, and a **credential-rotation procedure**. Atlas: least-privilege `readWrite` user scoped to one DB, IP allowlist, **separate credentials for preview vs production**. Deploy with `MONGODB_URI` in the host's encrypted server-side env — never in `vercel.json`, a committed config, or a build arg. |

---

## 7. Parallelization map

```
S0 ──► S1 ──► S2 ──┬──► S3 ──┬──► S6 ──► S7
                   │         │
                   └──► S4 ──┴──► S5
```

- **S0–S2 are the spine.** Sequential; nothing meaningful parallelizes before the vertical slice exists.
- **S3 ∥ S4** after Sprint 2 — filters touch `task.filters.ts` + toolbar; the palette touches `shortcuts.ts` + `palette.ts`. Disjoint files.
- **S5 joins** once 4.1 (registry) and 2.1 (update mutation) are merged; the board consumes both rather than reimplementing either.
- **S6 needs both** interaction sprints merged, because the a11y pass audits what exists.
- **Within a sprint**, different-lane PRs are concurrent — flagged per row above.

**Droppable under schedule pressure, in order:** 5.3 (pointer DnD) → 4.3 partial (keep `N`, `/`, `esc`, `↵`, `1 2 3`) → 6.3 (mobile) → 5.2 (board). Everything through Sprint 3 plus 6.1/6.2 and Sprint 7 is the non-negotiable floor — that set alone closes all seven ACs.

---

## 8. Verification

**Per PR (CI):** `npm run typecheck && npm run lint && npm run test && npm run build`

**Layered tests** (system design §16 — contracts, not coverage percentage):

- **Unit** — `task.schema` validation · `filterTasks`/`sortTasks`/`groupByDue` · status transitions · title normalization · `task.parse` composer tokens · platform key resolution.
- **Server** — create rejects malformed input · update rejects unknown status · delete handles a missing task · **DB errors map to safe application errors that leak no URI, stack or driver detail** · `q` cannot inject a Mongo operator · importing `env.ts` from a client module fails the build.
- **Secrets (CI, every PR)** — `gitleaks` over the diff and full history · no `.env*` tracked · built client output and SSR'd HTML contain no value from `env.ts` (§4.7).
- **Component** — composer validation · inline edit · filter behaviour · both empty states · **mutation error rolls the cache back to the exact snapshot** · palette keyboard interaction and focus return · axe on every component.
- **Integration (7.1)** — the single critical path, pointer and keyboard-only variants.

**Manual acceptance, run before calling it done:**

1. `npm run seed && npm run dev` → list paints from SSR. **Disable JS → the list still renders** (proves loader-backed SSR).
2. Create via composer → row appears instantly with a temp id → id swaps on confirm. Reload → present. *(AC1, AC7)*
3. Toggle status with `Space` → pill flips in **< 16ms**. *(AC3, AC6)*
4. Point `MONGODB_URI` at a dead host → mutate → row rolls back, toast offers Retry, **and the browser sees no connection string**. *(§12, §15)*
5. `/` → type → results in **< 50ms**, count announced. Copy `/?q=focus&status=todo,doing&due=week` into a fresh tab → identical view. Back → unfiltered. *(AC5, AC6)*
6. `⌘⌫` → confirm → undo toast → Undo → task returns. Repeat without undo → reload → gone. *(AC4, AC7)*
7. **Unplug the mouse.** Complete the entire flow — create, edit, filter, board-move, delete, undo — with the keyboard only.
8. Screen reader: result counts and save outcomes announce; the palette announces the highlighted row; every dialog returns focus to its trigger.
9. 360px viewport: no horizontal scroll, 48px touch targets, palette opens as a sheet.
10. `prefers-reduced-motion: reduce` → **nothing animates**.
11. **Secrets, by hand on the deployed app** (§4.7): View Source and search the HTML for the cluster host — nothing. Search every loaded JS asset and the dehydrated `__TSR__`/Query state payload — nothing. `process.env` and `import.meta.env` in the browser console expose no connection string. Then `git log --all -p -- '.env*'` → empty across the entire history.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The seven ACs in §2 are reconstructed, not given | They lead the plan and the README. A correction reshuffles the traceability column, not the sprints. |
| TanStack Start's server-fn / SSR API surface is still moving | Pin exact versions in 0.1. Sprint 1 is deliberately a thin end-to-end slice so any API surprise surfaces on day one, not in Sprint 5. |
| Scope is large for a take-home | §7's drop order is pre-agreed, and `main` is shippable after every PR — the build can stop at any sprint boundary and still demo a coherent product. |
| Natural-language date parsing (`tomorrow 4pm`) can sprawl | One small dependency (`chrono-node`), resolved client-side to an exact ISO instant, behind `task.parse.ts` with its own tests. If it misbehaves, the full form still sets dates and the composer degrades to plain titles. |
| Optimistic paths diverging from the server (**Failure Check 2**) | Every optimistic mutation ships with a rollback test in the same PR. Per-task-id mutation keys prevent the update-then-delete race in **Failure Check 6**. |
| Design fidelity competing with correctness | Sprints 0–5 build correctness in the design's token system; polish is Sprint 6+. Per system design §20, animation and micro-interaction come **only after** correctness. |
| **A credential reaching the repo or the browser** | Four independent guards, none relying on discipline (§4.7): `.gitignore` in the *first* commit + gitleaks in CI and pre-commit; no `VITE_` prefix + a browser-throwing `env.ts` + an ESLint import fence; DTO-only Query cache so nothing else is serialized into the SSR payload; and a CI assertion that greps the built client output and HTML for every env value. The SSR-payload vector is the subtle one — the loader dehydrates the cache **into the HTML**, so cache hygiene is a secrecy control here, not just a coupling one. |

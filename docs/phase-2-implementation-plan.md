# Phase 2: Self-hosted accounts and persistent user experiments

Status: Implemented and verified in the current workspace on October 8, 2026. The approved Phase 2 implementation and acceptance audit are complete.

## Purpose and existing decisions

Attach preferences, Discovery favorites/history, saved Creations, and temporary Playground history to an authenticated account. Preserve the implemented Phase 1 editing, inspection, save, restore, deletion, and cancellation behavior while replacing browser persistence with server persistence.

Use **Better Auth + SQLite** on the existing server. Accounts, sessions, preferences, and creations stay on that server's persistent storage. Relevant primary references: [Next.js integration](https://better-auth.com/docs/integrations/next), [SQLite support](https://better-auth.com/docs/adapters/sqlite), and the [username plugin](https://better-auth.com/docs/plugins/username).

The access flow remains:

**Register → waiting room → enter phrase and select emoji → account activated → webapp**

Later visits require only username and password. Retain the previously agreed exclusions: no email-based experience, password recovery, migration of existing browser data, admin dashboard, collaborative editing, offline synchronization, or background job infrastructure. Target one long-running Node server process with persistent local disk.

## Accounts and access

- Registration collects a unique username, display name, and password. Usernames are case-insensitive, 3–30 characters, using letters, numbers, underscores, and dots. Display names allow spaces and duplicates. Passwords are 12–128 characters; Better Auth handles hashing.
- Use Better Auth's username plugin. Its registration API still requires an email field, so a server registration adapter supplies a generated, non-deliverable address under `accounts.invalid`. Disable public email registration, email login, recovery, and account-linking endpoints. Validate these restrictions against the installed version before implementation.
- Store a server-owned `activatedAt` value, initially empty. Clients cannot set or modify it through account APIs.
- Unauthenticated visitors see login/registration. Authenticated, inactive users see `/waiting-room`. Activated users enter the app.
- The waiting room contains a phrase field, an accessible emoji picker, Submit, and Sign out, with English and Spanish interfaces.
- Keep the expected phrase and emoji ID in server-only configuration. Normalize phrase capitalization and whitespace; compare the selected emoji by its catalog ID. Correct submission permanently activates that account. Rotating the invitation affects future activations.
- Validate sessions and activation inside every application API, including preferences, creations, Discovery, media, and all generation methods. Return `401` without a valid session and `403` for inactive accounts. Ownership comes from Better Auth's immutable user ID, never a client-provided namespace or user ID.
- Use HTTPS, secure HttpOnly session cookies, same-origin mutation checks, and seven-day sessions. Enable database-backed authentication rate limits; limit activation attempts by account and IP. Never log passwords or invitation submissions.
- Return account data with private, non-cacheable responses. Do not put personal records into shared Next.js caches or provider/media caches. A cookie-presence redirect is only a navigation convenience; every protected operation validates the actual session.

The shared invitation controls admission; individual credentials identify the returning account. Session cookies identify access, while SQLite stores the user's application data.

## Account state and lifetime rules

| State | Account persistence | Lifetime and restoration |
| --- | --- | --- |
| Interface preferences | Language, theme, Discovery view, reduced-motion choice | Available on subsequent logins and other browsers |
| Playground preferences | Output kind, output language, model, reasoning effort, and existing tone value | Defaults for a fresh editor; separate from each creation's captured configuration |
| Discovery favorites/history | Existing emoji/topic records, identity, and timestamps | Preserve the current 200-favorite and 50-history limits |
| Saved Creations | Explicitly saved canvas/configuration/result states | Remain until manually removed from Creations |
| Temporary creations | Keep in session checkpoints and generation attempts | Remain until individually, selectively, or collectively removed; survive navigation, refresh, browser restart, logout, and login elsewhere |
| Active editor | Current canvas, authored configuration, and displayed result | Remains mounted across application tabs; starts blank on a full reload or new login |
| Presentation state | Camera, selection, undo/redo stack, clipboard, open panels, picker state | Kept in the active editor as appropriate; excluded from creation identity and account restoration |

“Temporary” describes collection membership, not an expiration policy. Do not apply session expiry, age-based cleanup, a 20-item cap, or automatic history trimming to either creation collection. Storage capacity remains finite; a full disk or failed write must report failure and preserve working content rather than evict creations.

New accounts start with fresh server data. Leave the Phase 1 IndexedDB database and legacy localStorage data untouched; do not import, delete, or show those records within an account. Phase 1's legacy browser migration remains a browser-only implementation detail and must not run for account repositories.

## Preserve the implemented creation model

Reuse the existing version-1 `CreationState`, composition schema, canonical identities, projections, restoration helpers, and `GenerationRun` statuses. Each state selects a canvas, an optional configuration, and an optional result/attempt.

```text
Account
├── Saved Creations
│   └── Exact canvas footprint
│       ├── Canvas-only projection
│       ├── Context / model configuration A
│       │   ├── Configuration projection
│       │   ├── Result A1
│       │   └── Result A2 / edited versions
│       └── Context / model configuration B
│           └── Result B1
└── Temporary history
    └── Same canvas/configuration grouping, including attempt statuses
```

- **Canvas identity:** ordered emoji identities/glyphs and variants, exact coordinates, scale, rotation, and stacking order. Geometry is not rounded. Different instance IDs alone do not create another root.
- **Configuration identity:** title, intent, edited interpretation, per-emoji labels/meanings/custom-meaning flags/notes/roles, relationships, and output kind/language/tone/model/reasoning settings. Canonical node slots rebind relationship endpoints across equivalent canvases.
- **Results:** retain attempt identity, generated title/text and edits, timestamps, model/provider identity, available usage/cost/generation metadata, original canvas/settings, and compiled brief. Preserve original compiler metadata when present; do not recompile old provenance on read.
- Canonical fingerprints remain versioned. Exclude camera, selection, panel visibility, undo, generated node IDs, and incidental timestamps from grouping. Server-side validation and fingerprint calculation must agree with the current client helpers.
- Defaults remain inactive until an authored context/settings change or Generate. Opening Context or Settings alone does not activate configuration. Clear configuration removes authored context and emoji bindings while keeping geometry and resetting inactive defaults.
- Canvas-only, canvas/configuration, and canvas/configuration/result states remain saveable. Authored configuration on an empty canvas is valid; a wholly blank inactive state is not saveable.
- Saved states are immutable snapshots. Saving changed content creates another saved state/version and preserves the earlier version. Distinct generation attempts stay distinct even if text matches; duplicate Save of the same state is idempotent within that account.
- Saved model IDs remain inspectable when unavailable. Require deliberate selection of an available model before generating. Do not replace a restored model silently. If an account's preferred model is unavailable, show that choice and require selection too; an account without a preferred model can use the configured initial default.
- Keep valid authored canvas/configuration data readable if an optional historical result is damaged. Reject malformed new writes explicitly rather than silently dropping their result. Do not overwrite the original damaged record during recovery.

## Server repository and SQLite records

Implement the existing asynchronous `CreationRepository` boundary (`list`, `put`, and `remove`) with authenticated requests. Inject this repository into the shared account workspace instead of hard-coding `browserCreationRepository()` in `useCreations` or the sidebar count.

Keep the proof of concept simple: store validated versioned JSON payloads with indexed metadata, retaining Phase 1's independent saved/temporary records. Do not require a fully normalized canvas/configuration/result database graph.

| Record/table | Responsibility |
| --- | --- |
| Better Auth tables | Accounts, sessions, credentials, rate-limit records, server-owned activation |
| Account preferences | Validated interface and Playground defaults, revision, update time |
| Discovery state | Validated favorites/history with existing identities, limits, timestamps, and revision |
| Creation records | Owner ID, collection, stable record/state ID, schema version, canonical identity, revision, creation/update time, JSON payload |
| Generation attempts | Owner ID + request ID, input fingerprint, immutable submitted inputs, status/outcome, checkpoint link, cancellation metadata, timestamps |
| Deletion metadata | Short Undo receipt/window and deletion tombstones needed to prevent completion or stale clients recreating removed checkpoints |

- Unique collection membership identities are scoped by owner and collection. Equivalent states belonging to different accounts never share personal records or membership.
- Keep the state/record identity stable through a generation's status transitions. Compute identity on the server; do not trust a submitted identity, timestamp policy, revision, or ownership claim.
- Generation inputs, provider metadata, and attempt status are server-owned. Client result edits may change allowed presentation content, such as text, while retaining the original account-owned attempt/provenance. Validate referenced attempts and snapshots against that account before accepting saved or temporary writes.
- Every mutation runs in a SQLite transaction. Apply expected revisions to temporary edits and deletion. Saved inserts preserve immutable content; a conflicting attempt to change an existing saved record fails.
- `Save creation` writes only the selected active state, not every sibling configuration/result. It does not consume or remove an existing temporary checkpoint. A save must be acknowledged before reporting success or permitting Save and continue.
- Derive Saved status with the existing `isStateSaved` behavior: the current components must match saved content, and canvas/configuration projections already contained in a richer saved state count as saved. Changed canvas/configuration/result content loses the marker unless that version is also saved; undo back to matching content restores it. Never persist a sticky `saved: true` flag on temporary records.
- Removing one collection never removes the other. Saved canvas/configuration removal removes the selected saved subtree's memberships only. Retain source snapshots needed by another membership, active generation, or valid Undo receipt.
- Individual deletion stays immediate; deleting several, selected entries, or all entries uses the existing confirmation. Resolve an explicit record/revision set so concurrent new arrivals are not accidentally swept into a previously confirmed deletion. Commit bulk deletion atomically.
- Keep the existing five-second Undo opportunity, scoped to account and collection, with atomic server restoration of the removed set. An opaque receipt validates ownership and expiry; Undo cannot overwrite concurrently changed records. A still-running attempt can finish within the Undo window so restoring it returns its actual latest status.
- After Undo expires, deleted history remains deleted. Retain only the minimal attempt/deletion metadata required to reject stale writes and repeat submissions; remove unreferenced content once no membership, active job, or Undo requires it. Tombstones are not visible history and do not cause completed results to reappear.
- Do not send the entire history back on each edit. Return changed records/revisions, then refresh the affected collection. Keep progressive rendering; no retrieval or rendering batch size may become a retention limit. The initial `list` contract can return all records for this small application; add cursor retrieval behind the repository if volume warrants it without changing the UI rules or Saved matching.

## Playground, Creations, and restore behavior

- Keep Playground → Creations in the sidebar; count saved canvas roots, not result leaves. Use account data for the initial badge and update it after successful mutations.
- Keep the saved tree and Canvas / Configuration / Result inspection controls. Selecting a canvas or configuration projects precisely that level; it never chooses an unrelated result. Inspection does not replace the editor.
- Preserve temporary history under the Playground editor with view, restore, save, individual removal, select-all, selected removal, all removal, and Undo. It uses the same canvas/configuration grouping and can contain more than 20 records.
- Generate and Keep in session create temporary checkpoints. Ordinary canvas/context edits do not create new checkpoints or automatically save Creations. Continue persisting edits to an associated temporary result with the existing 500-millisecond debounce; saved results remain immutable.
- Preserve Save creation, Keep in session, New canvas, Clear configuration, Context, Settings, current results, reading views, and source-input inspection. Canvas export/import remains removed; canvas-only Save/Restore covers resuming geometry and appearance.
- Support complete restoration and all seven nonempty selections of canvas/configuration/result. Unselected components remain in the editor. Complete restoration of a canvas-only state clears outgoing configuration/result.
- Configuration-only restore onto a different footprint applies portable scene fields/settings while retaining target emoji meanings/notes/roles/relationships, with the existing explanatory notice. Matching footprints receive full context rebound by canonical slots.
- Canvas-only restore preserves portable current configuration. Different footprints reset incompatible emoji bindings to defaults; matching footprints preserve them. Result provenance never changes.
- A separately restored result is a visual reference when its original inputs differ. Keep Result from different inputs and source inspection. Save excludes an unrelated reference result and saves the eligible current canvas/configuration; it never reparents a result. A reference-only view cannot create a fabricated association.
- Unsaved authored work still triggers Save / Discard / Cancel before restore or New canvas. Save and continue waits for server confirmation. Write failure/conflict keeps current work and the dialog open; Discard does not erase existing checkpoints or unselected components. Tab navigation does not prompt.
- Canvas restoration clears selection/editor undo and fits the objects. Configuration/result-only restore keeps the camera. Preserve the existing geometry, transforms, appearance, relationships, clipboard, keyboard, and fullscreen behavior.
- Preserve English/Spanish, all four themes, responsive layouts, reading/copy/edit controls, focus restoration, and accessible labels. Notification popups, including Undo banners, disappear after five seconds and repeated notices restart the timer. Information icons keep the shared hover style and open only on pointer hover; clicking cannot pin them open.
- Saving/failed/conflict state remains available beside the relevant action as ordinary inline status with Retry or conflict resolution after a transient notification disappears. Operation dialogs continue showing their unresolved error until resolved. Do not turn persistent state into permanently open notification popups.

## Generation, cancellation, and deletion races

Move generation checkpoint creation/finalization to the server. Browser receipt of the result must not be required to store it.

1. Authenticate and validate the request, including account activation, body size, configured model, request ID, and cancellation capability.
2. Reserve the owner/request ID and create its running temporary checkpoint transactionally **before** calling the provider. If persistence fails, do not submit a paid generation.
3. Call the existing non-streaming provider adapter with captured immutable inputs and cancellation/deadline signals. Keep the existing global rate/concurrency limits; scope idempotency and cancellation lookup by account + request ID and apply account limits without relaxing the global limits.
4. Persist success, failure, unknown, or canceled status before responding. If the browser disconnects without explicit cancellation, allow the server request to finish and persist its outcome while the Node process remains alive. A refresh/login can then list the completed checkpoint without restoring it automatically into the blank editor.
5. If the temporary membership was deleted during generation, do not recreate it. Keep any required in-flight/Undo state separately; a completion changes only a still-valid checkpoint or Undo snapshot. Deletion does not implicitly cancel the provider request; Cancel generation is the explicit cancellation action.

Additional rules:

- Restore and New canvas wait while a local generation is running. Navigation and inspection remain available. Cancel generation immediately releases the editor, keeps a canceled attempt when its checkpoint remains, and sends the explicit server cancellation request.
- Keep the Phase 1 per-request cancellation capability, adding authenticated ownership. Early cancellation records a durable reservation so a later POST cannot start the provider call. Another account or incorrect capability cannot cancel it.
- A terminal cancellation wins over a late provider response. Late responses cannot replace the active editor, resurrect a deleted checkpoint, or convert a canceled attempt into a successful result. Canceled requests still count against recent-request limits.
- Persist request deduplication across process restarts. Reusing an owner/request ID with different inputs fails; an existing terminal attempt returns its known outcome without another provider call. If the membership/content was intentionally deleted, return a terminal deleted response rather than resubmit or expose removed output.
- On startup, mark leftover running attempts unknown/interrupted; do not automatically retry. Preserve their inputs in surviving temporary history. Also reconcile expired in-flight state during normal requests if needed.
- Keep synchronous execution: no queue, streaming, automatic retries, or guarantee that a provider operation survives server shutdown. Completion is durable only after SQLite confirms it. If persisting an already-received provider result fails, preserve it in the current process/client where possible and expose explicit persistence retry; never retry the provider automatically.
- Cancellation stops local transport/waiting and cannot guarantee that the provider stopped processing or billing. Retain the current concise cancellation message.
- Explicit logout cancels this client's active generation through the authenticated cancellation route before session revocation when possible, clears local work, and records cancellation. Closing/disconnecting without that explicit action may allow server completion. Cancellation delivery failure must not prevent logout; any eventual outcome stays scoped to the original account.

## Loading, synchronization, and failures

- Load the authenticated account's preferences and collections before enabling mutations or autosave. Distinguish loading failure from an empty collection; never replace failed reads with defaults and write them over existing data.
- Initialize document language/theme from account preferences on the server and remove the account app's global localStorage theme bootstrap. Login/registration use neutral defaults or their current language choice. Account B must never briefly display Account A's preferences or records.
- Keep account preferences separate from captured creation configurations. Restoring an old output language/model changes the active working configuration without changing history. Persist explicit user preference changes; restoration alone need not overwrite account defaults.
- Save completed preference/Discovery actions immediately; debounce text/result edits by 500 milliseconds. Serialize mutations per edited record and update revision references from server responses. Visible Saving means pending persistence, while Saved to Creations means exact saved membership.
- Reject stale writes with `409`; preserve drafts and provide explicit reload/reapply against the newest revision. Do not silently overwrite another tab or instruct a blind retry with the same stale revision. Save protection must not continue until its save succeeds.
- Keep failed local edits in memory for explicit persistence Retry. Do not automatically repeat generation or overwrite server data after reconnect. Show recoverable errors without clearing the canvas/result.
- Synchronize same-browser tabs using account-scoped change notifications that trigger authenticated reloads. Refresh on window focus/re-entry for changes from another device; revision checks remain the authority. WebSockets and continuous device synchronization are not required.
- Use an account/session generation token and abort controllers to discard late reads/writes belonging to a previous login. Clear timers, optimistic drafts, cached records, badges, previews, deletion receipts, clipboard/editor state, and listeners on logout or account change. Pending requests never become writes under a later account.
- For explicit logout with unsaved work or pending/failed saves, reuse Save / Discard / Cancel protection before clearing it. Keep in session alone is not Saved to Creations. Logout remains available after choosing Discard; already persisted temporary records stay on the account. Unexpected session expiry cannot guarantee preservation of memory-only drafts; block writes, explain the interruption, and never copy those drafts into another account.

## Implementation sequence and boundaries

1. Read the relevant installed guides in `node_modules/next/dist/docs/` as required by `AGENTS.md`, then verify the chosen Better Auth integration/plugins and install/pin dependencies. Node modules are present in the current workspace; the earlier plan's absent-dependencies note is superseded.
2. Add SQLite migrations, authentication/session validation, registration adapter, activation gate, and login/waiting-room interfaces. Keep server-owned activation and ownership enforced in shared guards.
3. Add account preferences/Discovery persistence and initial server preference loading. Replace Explorer's localStorage effects/theme bootstrap and isolate the account workspace lifecycle.
4. Add the server `CreationRepository`, account-backed `useCreations`, and sidebar counts. Preserve versioned JSON, account-scoped deduplication, immutable saved versions, revision checks, atomic bulk deletion, and five-second Undo.
5. Connect generation to durable attempts/checkpoints, explicit cancellation, terminal idempotency, interrupted-job reconciliation, and deletion guards. Remove the browser's duplicate checkpoint creation/finalization and account-app unmount cancellation assumptions.
6. Integrate restore/save protection, result edits, failure Retry/conflict controls, notifications, and logout/account switching. Audit every browser storage caller so no account path accidentally uses the local repository or legacy preference records.
7. Run the acceptance checks below, update setup/configuration documentation, and prepare the persistent SQLite deployment/migration procedure.

Relevant implementation boundaries: `src/features/playground/creations.ts`, `creation-repository.ts`, `use-creations.ts`, `Playground.tsx`, `CreationHistory.tsx`, `src/components/Explorer.tsx`, `src/lib/storage.ts`, `src/lib/themes.ts`, `src/app/layout.tsx`, and `src/app/api/generations/route.ts`. Retain the existing notification and shared information-hover components.

## Acceptance and deployment checks

- Registration, case-insensitive uniqueness, duplicate display names, login/logout/session expiry, waiting-room persistence, activation combinations/rate limits, and direct API bypass protection.
- Two accounts cannot list, inspect, alter, delete, Undo, generate into, or cancel each other's records. Test forged owner/namespace/record IDs, cross-site mutations, late responses after account change, and disabled alternative authentication endpoints.
- Preferences, Discovery state, both creation collections, immutable original inputs, edited versions, and metadata survive another browser, logout/login, and server restart. Fresh accounts ignore intact legacy browser data. A full reload still starts a blank editor.
- Preserve exact canvas grouping across different instance IDs, sibling configurations, distinct repeated generations, all save depths, empty-canvas authored configuration, inactive defaults, Clear configuration, unavailable models, projection-based Saved status, edits/undo, and no duplicate Save.
- Verify all seven restoration selections, portable/bound context, reference results/source inspection, no result reparenting, camera/selection behavior, mounted editor navigation, and Save / Discard / Cancel with failed/conflicting server writes.
- More than 20 temporary and saved records remain available. Individual/selected/all temporary deletion and saved subtree deletion remain independent; active work stays visible. Bulk deletion/Undo is atomic, account-scoped, bounded to the current five-second affordance, and safe against concurrent changes.
- Closing the browser after accepted generation permits server completion/storage. Explicit cancellation before/during submission, wrong capabilities/accounts, late completion, deleted pending checkpoints, Undo during generation, restarted unknown attempts, and persistence failures cannot cause resurrection or a second provider submission.
- Test unavailable/full SQLite storage, failed reads versus empty state, failed saves and explicit Retry, stale revisions across tabs/devices, logout during pending requests, and preservation of memory-only drafts until an explicit discard.
- Preserve the existing canvas/editor regression coverage, desktop/touch layouts, English/Spanish, all themes, five-second notification expiry, consistent hover-only information icons, and accessible app/auth controls.
- Run unit tests, browser tests, type checking, and a production build. Test startup migrations and interrupted-attempt reconciliation against a persistent database.
- Keep SQLite outside the deployment directory on persistent local disk with restrictive permissions. Run versioned migrations before startup; fail startup on missing authentication/invitation configuration. Document HTTPS, database location, a consistent SQLite backup/restore procedure, and the one-process/no-serverless deployment requirement.

## Implementation record

The user gave the go-ahead to implement this plan. The current workspace adds Better Auth username/password accounts, server-owned invitation activation, SQLite migrations, account preferences/Discovery state, a server creation repository with independent memberships and atomic deletion/Undo, durable generation/cancellation/idempotency, and isolated workspace/logout handling. Application state no longer uses the legacy browser repository.

Preferences and Discovery records share one validated JSON row per account, with revisions and update timestamps. Creation payloads remain portable version-1 records. Immutable provenance digests preserve the ability to explicitly save visible editor work after its temporary history was deleted, while the attempt ledger prevents deleted outcomes from being returned or resubmitted automatically.

The local invitation is **small symbols infinite possibilities** + **🐙**, as selected by the user. Setup, persistent deployment, migrations, and consistent backup/restore are documented in [account-setup.md](account-setup.md). The acceptance record below covers the completed implementation.


## Completed acceptance audit

| Plan area | Implemented behavior and verification |
| --- | --- |
| Identity and admission | Pinned Better Auth username/password integration, immutable account ownership, permanent phrase/emoji activation, seven-day sessions, database-backed limits, same-origin writes, and guarded application APIs. Real authentication tests cover registration, uniqueness, activation, logout/expiry, ownership, forbidden authentication paths, and account switching. |
| Preferences and Discovery | Validated, revisioned account snapshots; server-rendered language/theme; persisted favorites/history and Playground defaults; focus and account-scoped tab synchronization. Browser tests verify another browser/login, stale-draft resolution, legacy-data isolation, and output language independent of interface language. |
| Saved and temporary Creations | Account-backed repository reuses the Phase 1 model and exact grouping/projections. Immutable saved versions and independent temporary checkpoints survive refresh, logout, and restart without a retention cap. Unit and browser checks cover all save depths, sibling configurations/results, unavailable models, all seven restoration selections, reference provenance, and exact-version result editing. |
| Deletion and Undo | Explicit revision sets, transactional individual/bulk deletion, account-scoped five-second atomic Undo, and tombstones. Saved and temporary removal remain independent; late completion cannot resurrect deleted history. |
| Generation and cancellation | Durable checkpoint before submission; owner/request/capability isolation; global and account limits; server completion; persistent terminal deduplication; early/late cancellation; interrupted-startup reconciliation. Storage failure tests verify no provider submission before persistence and storage-only retry after a received outcome. |
| Failures and workspace lifecycle | Failed reads remain failures; memory-only drafts survive failed saves; Save/Discard/Cancel guards restoration, New canvas, and logout. Explicit revision reapply targets the selected checkpoint; inline Retry survives notification expiry. Expired/account-switched clients cannot write under a new account. |
| Phase 1 UX preservation | English/Spanish, four themes, responsive desktop/touch geometry and controls, accessible account/editor/reading views, five-second notifications/Undo, consistent pointer-hover information icons, and mounted editor navigation. Regression checks cover the existing editor interactions and accessibility. |
| Operations | Native SQLite binding, private persistent database configuration, three repeatable application migrations plus Better Auth migrations, startup configuration validation, and documented single-process HTTPS deployment. Existing version-2 data upgrades without content/ownership changes. A production restart and actual online backup/restore were verified against isolated account data. |

Verification completed:

- **252 unit tests passed across 28 files**, using `npm test -- --maxWorkers=1`.
- **156 distinct browser checks passed across the full regression run and targeted repair/regression reruns**, using one worker. The initial full run identified 13 failures; all were fixed and their affected files rerun successfully. Five additional checks cover result conflict reapply, generation persistence retry, sidebar synchronization, exact-version restoration/editing, and independent output-language defaults.
- **Type checking and the production build passed.** Production builds used a separate `.next-production-check` directory, one build worker, and a bounded Node heap; browser tests used `.next-e2e` and a new isolated SQLite file.
- The production server admitted a registered/activated account, persisted preferences and both creation collections, retained them through a real restart, and revoked access on logout. Its live online backup passed SQLite integrity/count checks with mode `0600`; restoring that backup and starting the server retained the same data.
- `git diff --check` passed. Provider calls in automated checks were simulated; no paid generation was submitted and local user accounts were not used.

Public hosting was not part of this implementation request. The persistent-path, HTTPS proxy, startup migration, and backup/restore procedure is ready in [account-setup.md](account-setup.md). The intentionally excluded email/recovery, legacy import, collaboration, offline synchronization, and background-job features remain outside Phase 2.

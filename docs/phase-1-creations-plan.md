# Phase 1: Creations and restorable Playground experiments

Status: Implemented in the current workspace; verification recorded below.

## Purpose and phases

Make authored Playground states persistable, inspectable, and restorable before introducing accounts in Phase 2. Add **Creations**, nested under **Playground**, parallel to Favorites and History under Discovery.

Phase 1 uses browser storage behind a repository interface. Phase 2 adds account ownership, server storage, login, and invitation activation to the same domain model. The Phase 2 plan now follows this tree and explicit deletion. Its fresh-account policy remains unchanged unless separately revised.

## Agreed content model

One canvas footprint has zero or more configuration branches. Each canvas/configuration pair has zero or more independently generated results. A restorable state selects a canvas, an optional configuration, and an optional result.

```text
Canvas footprint
├── Canvas-only state
├── Context / model configuration A
│   ├── Configuration-only state
│   ├── Generated result A1
│   └── Generated result A2
└── Context / model configuration B
    └── Generated result B1
```

- **Canvas:** emoji identities and appearances/variants, coordinates, sizes, rotations, and stacking order. Compare persisted values exactly. Different canvas content creates a different root.
- **Configuration:** scene title, intent, edited interpretation, emoji meanings, notes, roles, relationships, and generation settings (output kind, language, tone, model, reasoning effort). Changes create another configuration branch under the same canvas.
- **Result:** generated title/text, edits, request identity, timestamps, provider/model identity, and available usage/cost metadata. Every result retains the exact canvas/configuration that produced it.
- Defaults are inactive until the first context/settings edit or Generate. Opening a panel alone does not activate configuration. **Clear configuration** returns to inactive defaults and removes authored context, including emoji-specific overrides/relationships, without removing canvas geometry.
- Generation activates the currently displayed defaults and captures immutable inputs before submission. Context-only drafts can be retained when no usable model is configured; generation continues to require a configured model.
- Saved model identifiers remain inspectable even if unavailable later. Require a deliberate model selection before new generation rather than silently changing a saved configuration.
- Stable canvas/configuration fingerprints exclude generated instance IDs, timestamps, selection, clipboard, undo stacks, panel visibility, and camera pan/zoom. Canonicalize node IDs to stacking-order slots and relationship endpoints to those slots. Do not round geometry for grouping. Hash a versioned canonical serialization.
- Scene names can label trees but are not canvas identity. Use the first authored scene title when available; otherwise use a localized Untitled canvas label and emoji preview. Existing labels remain stable as configurations are added.

## Temporary versus saved creations

- **Temporary creations** replace the Playground story shelf. Generate and **Keep in session** add checkpoints; ordinary edits alone do not create additional checkpoints.
- Temporary states persist through navigation, refresh, and browser restarts until individually or collectively deleted. Here, temporary means not explicitly saved to Creations, not short-lived browser memory.
- Remove the old 20-record truncation. Do not silently expire or evict application records. Storage remains subject to browser quota/eviction; failed writes must preserve working state and report failure.
- **Save creation** directly saves the state already present: canvas, canvas/configuration, or canvas/configuration/result. No Save dialog or compulsory title is introduced. Wholly empty inactive states are not saveable; authored configuration constitutes work even on an empty canvas.
- Save only the active configuration and associated active result, not all sibling branches. Repeated saves join matching canvas/configuration branches. An identical saved state is not duplicated. Distinct generation attempts remain distinct even when their text happens to match.
- Saving preserves the temporary checkpoint and marks it **Saved**. This marker is derived from an exact saved-state match and is not a sticky property. Canvas/configuration/result edits remove it; undoing back to an identical saved state restores it.
- Saving an edited configuration or result preserves the original saved version. Changed result content becomes another version under its original canvas/configuration association. Changed canvas content creates another root.
- Removing temporary checkpoints never removes saved states; removing saved states never removes temporary checkpoints. Do not delete shared underlying snapshots while either collection still references them.
- Keep the existing undo affordance for deletion and extend it to temporary bulk deletion. Individual selection and selected/all deletion should operate explicitly; render long lists incrementally without a retention cap.
- The active editor is separate from both collections. Deleting a checkpoint does not clear displayed work. It can change Saved status if the last matching saved state is removed.

## Navigation and interface proposal

- The sidebar shows Discovery → Favorites / History, then Playground → Creations. Playground itself opens the editor; Creations opens the saved library. Its badge counts saved canvas roots, not results.
- The Creations page uses an expandable canvas/configuration/results tree and a selected-state detail region. Canvas, Configuration, and Result controls inspect one component at a time.
- Selecting a canvas chooses its canvas-only state; selecting a configuration chooses canvas/configuration; selecting a result chooses all three. Do not silently choose an unrelated branch/result when restoring a higher tree node.
- Details offer component checkboxes and **Restore selected**, supporting any nonempty selection of available components. Inspection alone never replaces the editor.
- Keep the editor mounted when navigating to Creations or Discovery, retaining canvas, fields, camera, and current result.
- Add **Save creation**, **Keep in session**, and **New canvas** near Playground's creation controls. Retain Context, Settings, canvas tools, and the active result/reading view. Show saved/unsaved/write-failure state without equating temporary persistence with saved status.
- Show temporary history beneath the editor, grouped into the same hierarchy. Entries provide view, restore, save, and delete actions; bulk selection provides manual deletion. Completed results remain editable/copyable.
- New interface labels and notices use the existing English/Spanish localization and four-theme system. Preserve keyboard/touch access, focus restoration, and narrow-screen layouts; stack tree/details on small screens.
- The interactive proposal uses sample data. It illustrates the primary flows; its simplified records are not the production persistence implementation.

## Restoring and protecting work

- Restore replaces only selected components and retains the others. A result restored independently is a visual reference, not a result generated from the current editor inputs.
- If only configuration is restored onto a different canvas, apply portable scene text and generation settings. Retain target emoji meanings, notes, roles, and relationships. Show a notice that source emoji-specific fields were not applied. Matching canvases receive the complete configuration with canonical node bindings.
- If only canvas is restored, preserve existing configuration's portable fields. Preserve emoji-specific fields only on an identical footprint; on a different footprint initialize default meanings/roles and empty notes/relationships. Explain that the old bindings could not follow the new canvas.
- Any resulting configuration composition is a new working configuration, not a mutation of the source snapshot. Result provenance always remains unchanged.
- Display **Result from different inputs** when an active result does not match the current canvas/configuration; allow inspection of its original inputs. Save excludes that reference result, saving only current canvas/configuration. Do not create reference links or reparent results.
- If current authored work is not exactly saved, restoring any component or choosing New canvas first opens **Save / Discard / Cancel**. Ordinary navigation does not prompt.
- **Save and continue** commits the current eligible state to Creations before replacement. A failed write keeps both the dialog and current work, and prevents replacement. **Discard and continue** permits replacement of the selected components without saving their outgoing values; unselected components and existing checkpoints remain intact. **Cancel** leaves everything intact.
- Remove canvas export/import from the interface. Canvas-only Save and Restore now cover resuming a composition, including its geometry and appearance. Preserve the version-1 composition schema for existing records and migration.
- Meaningful work includes authored fields or a visible result, not just emojis. Camera movement, selection, and panel expansion alone do not require saving. A reference-only state can be discarded, but cannot be saved as a new result association; allow the user to continue after explaining that its source is already preserved.
- Loading a canvas resets selection and the undo stack, and fits its objects to the current viewport. Configuration/result-only restoration retains the current camera. Camera state is presentation, not canvas identity.
- A refresh starts a blank active editor while both saved and temporary collections remain available, consistent with the previously chosen refresh behavior.

## Generation and cancellation

- Generation attempts remain attached to immutable original inputs. Running, failed, unknown, and canceled attempts are inspectable in temporary history; only completed outputs are generated-result leaves.
- Restore and New canvas cannot replace the editor while generation is running. Offer **Cancel generation** next to the in-progress action. Navigation/inspection remains available.
- Cancel releases the editor immediately, keeps the attempt's canvas/configuration, records cancellation with unknown provider outcome when necessary, and never retries automatically. A late response must not replace the current editor or convert a canceled attempt into an active result.
- Pass cancellation through `GeneratorAdapter.generate` to the outbound fetch alongside its existing deadline. Add an explicit same-origin cancellation route for active requests, using a per-request random cancellation capability held by the submitting client. Cancel must not rely solely on closing the browser's response connection. Cancellation before submission must also prevent a queued provider call.
- Retain request deduplication and global rate/concurrency limits. Canceled requests continue counting against the recent-request limit, and retain terminal deduplication records so a transport retry cannot resubmit them.
- With the current non-streaming provider transport, cancellation stops local waiting/transport but cannot guarantee stopped provider processing or billing. Display a concise notice and preserve the unknown outcome. Streaming and provider routing are outside Phase 1; they can later improve upstream cancellation support.
- Reference: [OpenRouter cancellation guidance](https://openrouter.zendesk.com/hc/en-us/articles/51691588409883-How-do-I-cancel-a-streaming-request-and-which-providers-stop-billing-when-I-do).

## Persistence and implementation boundaries

- Introduce versioned portable CreationState records and canonical CanvasSnapshot/ConfigurationSnapshot projections. Each state contains its canvas, optional configuration, and optional result with its immutable original inputs. Stable IDs, collection membership, a storage namespace, content fingerprints, and revision numbers prepare the data for an account repository. Phase 1 duplicates state payloads across independent temporary/saved memberships; normalized server tables can follow in Phase 2.
- Use one repository with asynchronous operations to list states, keep temporary states, save creations, and remove memberships individually/in bulk. Pass a storage namespace rather than binding components to global browser keys. Phase 1 uses a local namespace; Phase 2 supplies an authenticated user namespace and server implementation.
- Store records and memberships in IndexedDB with transactional commits. Canonical fingerprints support tree grouping; result versions and generation attempts use stable IDs. Preserve known historical compiler versions and original inputs rather than silently recompiling history into current provenance.
- Upgrade the existing Playground database with an idempotent transaction. Bring current story-shelf records into temporary history, preserving valid board/settings/result snapshots and edited text. Do not automatically mark them Saved. Malformed optional records must not erase valid records or the legacy source.
- Preserve the existing legacy workspace and localStorage explorer preferences. Legacy active-canvas state is not automatically restored on page load. Do not remove source data until migration is verified.
- Use a shared workspace controller for the editor, history, and library. Keep persistence, identity, tree projection, and restoration separate from rendering and existing geometric editing reducers.
- Retain browser-only generation/storage behavior in Phase 1; do not introduce accounts, login, SQLite, or invitation configuration here.
- The browser repository should reject stale writes to edited records and surface conflicts without silently overwriting another tab. Immutable snapshot inserts and collection membership updates should not rewrite complete histories on every editor edit.
- Before implementation, install dependencies and read relevant guides under `node_modules/next/dist/docs/` as required by `AGENTS.md`. That directory was absent during planning.

## Acceptance and verification

- Identical canvas content with different generated node IDs groups together; changes to glyph, variant, geometry, rotation, or stacking separate roots. Context-only changes create sibling configurations.
- Repeated Generate with identical inputs adds result leaves. Save supports canvas-only, canvas/configuration, and canvas/configuration/result; duplicate Save is idempotent and earlier saved edits remain recoverable.
- Defaults, panel opening, context activation, Clear configuration, and absent/unavailable models behave as specified. Saving an empty canvas with authored context works; saving wholly empty state is disabled.
- Saved status follows exact content through edits, undo, result changes, saved-state deletion, and restoration. Temporary deletion and bulk deletion preserve saved records.
- Every restoration component combination preserves unselected state, handles incompatible emoji bindings, and keeps original result provenance. Save never attaches a reference result to different inputs.
- Save / Discard / Cancel protects restore/New, including save failures. Switching app tabs retains editor and does not prompt.
- Pending generation blocks replacements; cancellation unblocks them, preserves its attempt, propagates to transport, and prevents queued calls, late UI replacement, and automatic retry.
- Both collections survive refresh/restart and support more than 20 records without trimming. Migration is repeatable and preserves existing valid history; corrupted records, quota failures, and stale writes cannot destroy valid work.
- Check desktop/mobile, all existing themes, English/Spanish, keyboard focus, screen-reader labels, and touch targets. Run relevant unit/browser suites, type checking, and a production build.

## Defaults chosen for the interface proposal

Group by exact scene content rather than visual similarity. Start saved-tree branches expanded for the selected canvas; use progressive rendering for long histories. Count canvas roots in the sidebar. Use readable scene/result titles with localized fallbacks. Keep the existing active-editor refresh reset, and treat pan/zoom and undo as editor presentation rather than saved experiment content. Do not implement account migration or streaming in this phase.

## Implementation record

The current implementation adds the nested Creations library, an exact-content tree and component inspection/restoration, persistent temporary checkpoints, individual/selected/all removal with Undo, save protection, and cancellation. It removes the old canvas file controls and 20-attempt retention cap. Storage uses IndexedDB version 2 while preserving the legacy workspace. SHA-256 fingerprints deduplicate saved states; revision checks prevent stale updates and deleted pending attempts from being recreated by late completions. Active editor state still starts blank on refresh.

The account-facing boundary is `CreationRepository`, scoped by namespace. Phase 1 uses `local`; Phase 2 will replace the repository with authenticated server operations and derive ownership from the session. All generation attempts retain their source canvas/configuration, even when a result is restored as a reference.

## Validation completed

- 233 unit tests passed, including canonical identity, all seven restore combinations, result provenance, malformed optional result recovery, blank-state handling, and cancellation capability/transport checks.
- All 137 current browser scenarios passed across the full-suite execution and targeted reruns. Coverage includes generation and editing, canvas transforms, keyboard focus, English/Spanish, all four themes, desktop/touch layouts, independent collections, individual/selected/all deletion and Undo, failed-save protection, cancellation and late responses, more than 20 records, legacy migration, unavailable saved models, and stale edits across tabs. Older fixtures now restore through temporary history rather than importing canvas files.
- Type checking, production build, and `git diff --check` passed. The production build required execution outside the process sandbox so Next could read its child TypeScript process output.

Phase 1 remains browser-local. No account, login, activation, SQLite, or deployment changes were implemented. Provider processing/billing may continue after non-streaming cancellation; the app explains this and prevents automatic resubmission.

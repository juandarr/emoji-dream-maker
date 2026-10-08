# Phase 2: Self-hosted accounts and saved user data

Status: Agreed implementation plan; implementation has not started.

## Summary

Use **Better Auth + SQLite** on your existing server. Accounts, sessions, preferences, and saved creations stay on your storage. Better Auth provides [Next.js integration](https://better-auth.com/docs/integrations/next) and [SQLite support](https://better-auth.com/docs/adapters/sqlite).

The flow is:

**Register → waiting room → enter phrase and select emoji → account activated → webapp**

Later visits require only username and password. No email, password recovery, or migration of existing browser data.

## Accounts and access

- Registration collects a unique username, display name, and password. Usernames are case-insensitive, 3–30 characters, using letters, numbers, underscores, and dots. Display names allow spaces and duplicates. Passwords are 12–128 characters; Better Auth handles hashing.
- Use Better Auth’s username plugin. Its registration API [still requires an email field](https://better-auth.com/docs/plugins/username), so a server registration adapter supplies a generated, non-deliverable address under `accounts.invalid`. Disable public email registration, email login, recovery, and account-linking endpoints.
- Store a server-owned `activatedAt` value, initially empty. Clients cannot set or modify it through account APIs.
- Unauthenticated visitors see login/registration. Authenticated, inactive users see `/waiting-room`. Activated users enter the app.
- The waiting room contains a phrase field, an accessible emoji picker, Submit, and Sign out. Provide English and Spanish interfaces.
- Keep the expected phrase and emoji ID in server-only configuration. Normalize phrase capitalization and whitespace; compare the selected emoji by its catalog ID. Correct submission permanently activates that account. Rotating the invitation affects future activations.
- Check sessions and activation inside every application API, including discovery, media, and generation. Return `401` without a session and `403` for inactive accounts.
- Use HTTPS, secure HttpOnly session cookies, same-origin mutation checks, and seven-day sessions. Enable database-backed authentication rate limits; limit activation attempts by account and IP. Never log passwords or invitation submissions.

The shared invitation controls admission; the individual credentials identify the returning account.

## Saved data and application behavior

- Add SQLite tables for account preferences, discovery state, and creation records, linked to Better Auth’s immutable user ID.
- Save language, theme, discovery view, reduced-motion preference, and Playground output/model/reasoning choices. Restore a configured default if a previously selected model becomes unavailable.
- Preserve current limits: **200 favorites and 50 discovery-history entries**. Phase 1 removes the creation retention cap; both temporary and saved collections remain until explicitly deleted.
- Implement the Phase 1 `CreationRepository` contract on the server. Preserve its versioned state payloads, exact canvas/configuration tree, immutable result inputs, separate temporary/saved memberships, deduplication, revision checks, component restoration, and deletion/undo behavior. Derive the namespace from the authenticated account.
- Start every page load with a blank canvas and no active result. Retain the current canvas while switching application tabs. Saved creations remain accessible through Playground → Creations; temporary checkpoints remain in Playground history.
- Replace active account persistence through `localStorage` and IndexedDB with authenticated server storage. Leave legacy browser records untouched and do not import them.
- Load account data before enabling edits or autosave. Initialize language/theme from server preferences so another user’s browser settings cannot appear.
- Save completed actions immediately; debounce typing by 500 milliseconds. Show saving, saved, and failed status. Keep failed edits available in memory for explicit retry.
- Use revision checks to reject stale writes from another tab/device. Show a conflict notice and preserve unsaved edits in the editor for explicit retry before reload; automatic merging and offline synchronization are excluded.
- On logout, clear account data from memory and cancel pending client saves.

## Interfaces and generation

- Add server registration and activation endpoints alongside Better Auth’s session/login/logout routes.
- Add authenticated endpoints for preferences, discovery state, and listing/updating/deleting creations. Derive ownership from the session; never accept a client-selected user ID.
- Reuse existing composition, discovery, and result validation on server writes.
- Update generation to create and finish the user’s temporary generation checkpoint on the server, so closing the browser does not prevent a completed response from being stored.
- Scope request deduplication by user and request ID. Preserve existing generation limits and synchronous execution. Interrupted requests become `unknown` without automatic resubmission.

## Verification and deployment

- Test registration, case-insensitive username uniqueness, duplicate display names, login, logout, and expired sessions.
- Test waiting-room persistence, incorrect phrase/emoji combinations, activation, rate limits, and direct API bypass attempts.
- Verify two accounts cannot read, alter, or delete each other’s records.
- Verify settings and saved creations survive browser changes and server restarts; refresh still opens a blank canvas.
- Test result editing/deletion, interrupted generation, failed saves, stale writes, and logout during pending requests.
- Run unit tests, browser tests, type checking, and a production build.
- Keep SQLite outside the deployment directory on persistent local disk. Run versioned migrations before startup and fail startup on missing authentication/invitation configuration.
- Before implementation, install dependencies and read the relevant bundled Next.js guides required by `AGENTS.md`; `node_modules` was absent when this plan was prepared.

Assumptions: one Node server process, private application access after activation, fresh account data, no recovery flows, no admin dashboard, and no collaborative canvas editing.

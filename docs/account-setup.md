# Account setup and operation

Phase 2 uses Better Auth 1.7.7 and better-sqlite3 13.0.3 in one long-running Node process. Use Node 24 (Node 22 or newer is required by the SQLite dependency). Authentication, creation payloads, and generation attempts live in the same SQLite file on persistent local disk.

## Local setup

1. Run `npm install`. The pinned SQLite install script is approved in `package.json`; it installs/builds the native binding for the host. A host without a matching prebuilt binding needs its normal Node native-build toolchain.
2. Copy `.env.example` to `.env.local`, retaining your existing provider configuration if you already have that file.
3. Set the required private configuration below, then run `npm run dev`. The origin must match the port you use. For example, an origin ending in `:3001` requires `npm run dev -- --port 3001`.

| Variable | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | At least 32 characters; generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BETTER_AUTH_URL` | Exact app origin, such as `http://127.0.0.1:3000`, with no additional path |
| `ACCOUNT_DB_PATH` | Absolute SQLite filename in a private persistent directory outside the deployed checkout, such as `/home/you/.local/share/emoji-dream-maker/accounts.sqlite` |
| `INVITATION_PHRASE` | Your admission phrase; comparison ignores case and repeated whitespace |
| `INVITATION_EMOJI_ID` | Base catalog ID, such as `1F419` for 🐙 |

Local development in this workspace is configured for `http://127.0.0.1:3001`, with the database at `/home/overcode/.local/share/emoji-dream-maker/accounts.sqlite`. The user selected **small symbols infinite possibilities** and **🐙** as the local invitation. The generated authentication secret is stored only in the ignored `.env.local` file.

If startup reports missing account configuration, check the `.env.local` file in the checkout you are running. This file is ignored by Git and does not automatically accompany another clone or worktree. Configure all five account variables there, preserve your existing provider keys, and restart the dev server. `BETTER_AUTH_SECRET` must have at least 32 characters, `ACCOUNT_DB_PATH` must be absolute, and the octopus invitation uses the catalog ID `1F419`, not the glyph. For this workspace, start with `npm run dev -- --port 3001` and open `http://127.0.0.1:3001` so the origin matches the account configuration.

Registration asks for username, display name, and password. It opens the waiting room; the phrase and emoji permanently activate that account. Later visits use username/password. There are no email or recovery flows. Rotating the invitation does not deactivate existing users.

## Data behavior

Preferences, Discovery favorites/history, saved Creations, and temporary history belong to the immutable account ID. New accounts start fresh and ignore the preserved legacy localStorage/IndexedDB records. Login and session cookies contain access credentials; they do not contain the creation library.

Both creation collections remain until manually removed, including across logout, another browser, and server restarts. Temporary deletion is independent of saved deletion. The current editor remains separate and starts blank on refresh; switching application tabs retains it. The five-second deletion Undo window restores the removed set atomically. After it expires, tombstones retain only the information required to reject stale operations and repeated provider submission. A digest of original inputs/metadata lets an editor deliberately save its still-visible work without storing or returning deleted output.

Generation checkpoints are committed before provider submission. Completion is stored by the server even if the browser disconnects. Explicit cancellation/logout sends a cancellation request; provider processing or billing may continue. A restarted running attempt becomes unknown/interrupted and is never retried automatically. Failed final persistence offers Retry that retries SQLite only.

Saved creation snapshots are immutable; temporary result edits and preferences use revisions. A conflict preserves the draft and offers explicit reapply against the latest revision or loading the latest data. A failed read is not treated as an empty account. Saving/failed state uses inline status; notification and Undo banners expire after five seconds.

## Deployment and migrations

Set the same variables on the service, use an HTTPS origin, and mount the private SQLite directory on persistent local disk outside the release directory. The app rejects HTTP origins other than localhost. Session cookies are HttpOnly and SameSite=Lax; HTTPS configuration enables Secure cookies. At a reverse proxy, overwrite untrusted forwarded-IP headers before passing them to the app's rate limiters.

Run `npm run build` with the configuration available, then `npm run start` on the appropriate port behind the HTTPS proxy. Keep one Node process against the file; no serverless/edge deployment or multiple-process generation coordination is implemented. Keep the database directory private and exclude `.env.local`, SQLite files, and backups from public/static artifacts.

Startup validates required configuration, applies the numbered application migrations and Better Auth schema migrations, then reconciles interrupted attempts before serving protected operations. Migrations are idempotent. Restart after deploying code/schema changes; take a backup before an upgrade. Do not reset the database when restarting or replacing a checkout.

Application migration 1 creates preferences/Discovery state, creations, attempt ledger, and request-limit tables. Migration 2 adds preference update timestamps and immutable provenance digests. Migration 3 adds creation and generation-attempt update timestamps, backfilling existing rows. Better Auth maintains users, credentials, sessions, verification, username uniqueness, and database-backed authentication rate limits. Account data is stored as validated versioned JSON with metadata indexes; it does not require a normalized scene graph.

## Consistent backup and restore

Use SQLite's online backup API to capture a consistent database, including transactions in the WAL:

```sh
node --env-file=.env.local scripts/account-backup.mjs /private/backup/accounts.sqlite
```

If your service already supplies environment variables, omit `--env-file`. The backup includes private credentials and session data; store it with the same access restrictions as the live database. Copying only the live `.sqlite` file during writes is not the backup procedure.

To restore, stop the Node service, preserve the current database and its `-wal`/`-shm` files together as a rollback copy, and remove those files from the live location. Put the selected backup at `ACCOUNT_DB_PATH`, restrict the file to its service owner (mode `0600`) in a private directory (mode `0700`), then start the service. Startup applies any missing migrations and marks interrupted attempts unknown. Keep `BETTER_AUTH_SECRET` and the origin configuration consistent with the restored service.

## Checks

`npm test -- --maxWorkers=1`, `npm run typecheck`, `npm run test:e2e`, and `npm run build` verify the implementation. The browser suite uses one worker, a separate `.next-e2e` build directory, and a new temporary SQLite file, leaving local accounts and the developer's running app alone. Provider responses in UI fixtures are simulated; the real account repository handles their persistence, save/restore, and deletion. Separate server tests cover authentication, durable generation, cancellation, revision conflicts, storage failures, and restart reconciliation without submitting paid requests.

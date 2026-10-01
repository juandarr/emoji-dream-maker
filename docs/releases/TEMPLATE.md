# App status snapshot — vX.Y.Z

- **Tag:** `vX.Y.Z`
- **Tagged commit:** `<full commit SHA>`
- **Snapshot date:** `<YYYY-MM-DD>`
- **Audience:** project maintainers

## Summary

Describe what the app does and whether this version is local, hosted, or both.

## Feature status

Use one status per row: **Delivered**, **Partial**, **Not configured**, or **Planned**. Add concise evidence and explain material limitations. For a coded integration whose live credentials or smoke test are absent, distinguish implementation status from live-connection status in the notes.

| Area | Status | State at this version |
| --- | --- | --- |
| Emoji catalog and search | | |
| Subjects, context, and exploration | | |
| Favorites, history, and preferences | | |
| Interface and accessibility | | |
| Provider services | | |
| Hosting and operations | | |

## Interface

Describe the main screens, interaction patterns, responsive behavior, and accessibility support present at the tagged commit.

## Services and data

For each external service, describe what the app requests, how the integration is configured, whether live access was verified, and any quota or quality limits. Never include API keys, tokens, personal contact values, or other secrets.

## Verification

List the tests, builds, manual checks, and live-provider checks recorded for this snapshot. Distinguish fixture-based tests from real provider coverage, and include only results tied to this commit.

## Limits and planned work

Record important known issues and capabilities explicitly out of scope or planned for later versions.

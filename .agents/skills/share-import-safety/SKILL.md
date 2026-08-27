---
name: share-import-safety
description: Data-safety and timing rules for OpenLove's partner-sync/backup import pipeline and profileStore's async IndexedDB init. Use before touching profileStore.importJSON, profileStore.ready, parseSharePayload, detectFullBackup, the #import= hash effect in src/routes/+page.svelte, src/lib/components/share/*, or src/lib/utils/share.ts. Also use before adding any date-only comparison (milestone due-dates, "same calendar day" logic). Triggers on "import backup", "share payload", "sync code", "QR import", "profileStore.ready", "importJSON", "hash import", "same day" date comparisons.
---

# Share/Import Safety & Async-Init Timing

Three real bugs were found and fixed in this codebase's sync/import/date-comparison code
during the 2026-08-27 refactor (see `REFACTOR_PLAN.md`, Critical C1 and Phase 7). All three
are the kind of mistake that looks correct in review and only fails under a specific timing
or input shape. Read this before touching any of the areas above.

## 1. `profileStore.importJSON()`'s full-backup branch ignores `mode` — CRITICAL

`importJSON(json, mode)` has three branches. The single-bond branches (`isSingleBond`
invite, V1 legacy) respect `mode: 'replace' | 'add'` — replace overwrites the active bond,
add appends a new one. **The full-backup branch does not**: whenever the parsed payload is
shaped `{ version: 2, bonds: [...] }`, it unconditionally does `this.state = { ...bonds
from the payload... }`, replacing every bond on the device, regardless of what `mode` was
passed.

**The trap:** if you ever route a payload of unverified shape through the same
Add-as-New/Replace-Current UI built for single-bond invites, a user who thinks they're
clicking "Add as New Bond" will silently have every existing bond wiped and replaced by
whatever was in that payload. This is a real, user-facing data-loss bug, not a theoretical
one — it was one commit away from shipping in `ScanImportModal.svelte`.

**The rule:** before importing any payload of unverified shape, call `detectFullBackup(json)`
(`src/lib/utils/share.ts`) first.

- If it returns non-null: this is a full backup. Never route it through the single-bond
  preview/replace/add flow. On a device with no existing configured bond, importing
  directly is safe (nothing to lose). On a device with existing bonds, require an explicit,
  unambiguous confirmation that names what will happen — see `ScanImportModal.svelte`'s
  `handleImportData` and `+page.svelte`'s `handleImportHash` for the reference pattern
  (a native `confirm()` naming the exact bond count, matching the same pattern this
  codebase already uses for `handleResetData`/`handleDeleteCurrentBond` in
  `SettingsSheet.svelte` — don't invent a new UI convention for this).
- If it returns null: fall through to `parseSharePayload()`'s existing single-bond handling
  as normal.

## 2. `profileStore.ready` must be awaited by anything that can run before first paint — CRITICAL

This is already documented as Invariant 8 in `AGENTS.md` ("Never sync before `await
profileStore.ready`"). It is easy to satisfy for code that only runs in response to a user
clicking something in the already-rendered app (the UI to trigger it literally can't exist
before `profileStore.isLoading` is false, so `ready` is trivially already resolved by then).

**It is easy to violate for code that runs on mount** — specifically, top-level `$effect`s
in `+page.svelte` that don't wait for anything before doing their own async work. The
`#import=` hash-handling effect is exactly this shape: it can start running, and even
finish calling `profileStore.importJSON()`, *before* `profileStore.init()` (kicked off from
the store's own constructor) has resolved. When `init()` finishes afterward, its `this.state
= loaded` assignment silently reverts whatever the early import just wrote — this was
reproduced directly: a full-backup import via a hash link would complete, clear the URL,
and then the page would revert to the onboarding screen a moment later as the stale
pre-import state landed on top.

**The rule:** any function invoked from a mount-time `$effect` (not gated behind user
interaction with the already-rendered app) that reads `profileStore.state` for a real
decision, or calls a mutating method (`importJSON`, `updateBond`, `update`, `setPhoto`,
`addBond`, `deleteBond`, `setActiveBond`, `setColorPalette`/`setUITheme`/`setColorMode`),
must `await profileStore.ready` first — see `handleImportHash()` in `+page.svelte`.

## 3. Reactive `$effect`s that mutate what they read must guard against re-entrancy

An `$effect` that reads `profileStore.state.X` as part of its own condition, and whose own
async body eventually causes `X` to change (e.g. any successful `importJSON` call sets
`isConfigured: true`), will be re-triggered by Svelte *while the first run's async work is
still in flight* — because the state mutation is itself a tracked dependency. Without a
guard, this reprocesses the same input a second time: for the hash-import effect, that
meant popping a second, spurious "this will replace everything" confirmation for an import
that had already completed.

**The rule:** if an effect keys off an external, idempotent input (a URL hash, a query
param) and its own side effects can retrigger itself, track "have I already started
handling this exact input" explicitly and bail out on a repeat — see the
`handledImportHash` guard in `+page.svelte`. Don't assume an effect runs exactly once per
meaningful external change just because it looks like it should.

## 4. Date-only ("same calendar day") comparisons must use local getters, never `toISOString()`

`toLocalDateString()` in `src/lib/server/scheduler.ts` exists specifically to avoid this.
`calculateMilestones()` (`src/lib/utils/time.ts`) builds every `targetDate` with
`new Date(year, month, day)` — a **local-timezone** constructor. `date.toISOString()`
always renders in **UTC**. Comparing a local-constructed date's ISO string against another
local-constructed date's calendar components (or vice versa) introduces a bug that depends
on the *server process's* timezone offset, independent of any subscriber's own timezone
setting: it shipped as Critical finding C1 (milestone push notifications firing on the
wrong day whenever the container's `TZ` wasn't UTC) and stayed invisible for a long time
because the common Docker default happens to be UTC, where the bug is a no-op.

**The rule:** when comparing whether two `Date` objects represent the same calendar day,
compare `getFullYear()`/`getMonth()`/`getDate()` directly (see `toLocalDateString()`),
never `.toISOString().split('T')[0]`. This applies anywhere a `Date` built from local Y/M/D
components gets compared against a calendar-date string — not just the scheduler.

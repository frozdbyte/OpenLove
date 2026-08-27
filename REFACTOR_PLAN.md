# OpenLove — Architectural Audit & Refactor Plan

**Scope:** Full read-only audit of `src/` (SvelteKit 2 / Svelte 5 app). Generated code
(`src/lib/generated/prisma/**`) and third-party UI atoms (`src/lib/components/ui/**`) were
scanned but excluded from findings — they are not hand-maintained.

**Mode:** Analysis only. No source files were modified while producing this document.

---

## 1. Executive Summary

The codebase is in good shape for its size: `AGENTS.md`'s eight invariants are honestly
upheld everywhere I checked (single service worker, one-directional sync, DOM-free SW-safe
modules, VAPID host validation), and the sync/outbox layer (`src/lib/sync/`,
`src/lib/storage/outbox.ts`, `src/lib/server/sync.ts`) is genuinely careful, well-commented
engineering — coalescing, idempotency, and last-write-wins are all correctly reasoned about.

The problems are concentrated in two places:

1. **One 1,212-line God Component** (`SettingsSheet.svelte`) that owns eight unrelated
   concerns and internally repeats the same 10-line update block six times.
2. **The same logic reimplemented independently in 2–3 places** rather than shared — most
   notably the share-payload decode routine (three copies) and the two "Modern" theme
   components (~90% identical markup).

There is also one genuine, non-obvious **correctness bug** in the milestone scheduler: a
timezone mismatch between how target dates are constructed and how they're compared can
cause the server to notify subscribers a day early or late, depending on the *server's*
system timezone — independent of the subscriber's own timezone, which the code otherwise
handles carefully.

Finally: **there are zero automated tests** in the repository. For a codebase whose hardest
problems are precisely the kind unit tests are best at (date/milestone math, outbox
coalescing, last-write-wins conflict resolution), this is the biggest structural risk here,
worse than any single bug below.

None of the findings below require schema changes, API contract changes, or touch the
Privacy Invariant's server-side column allowlist.

---

## 2. Issue Matrix

### 🔴 Critical

#### C1. Timezone-dependent off-by-one-day bug in the milestone scheduler
**File:** [`src/lib/server/scheduler.ts:52-81`](src/lib/server/scheduler.ts#L52-L81), root cause shared with [`src/lib/utils/time.ts:168,198,218,239`](src/lib/utils/time.ts#L168)

`checkAndDispatchMilestones()` resolves the subscriber's local calendar date correctly via
`Intl.DateTimeFormat` (line 41-50), then builds `localDate = new Date(sYear, sMonth-1, sDay)`
(line 53) — a `Date` interpreted in the **server process's** system timezone, not the
subscriber's. That's passed as `now` into `calculateMilestones()`, whose milestone
`targetDate`s are likewise built with `new Date(year, month, day)` (local-timezone
constructors, `time.ts:168/198/218/239`).

The bug surfaces at the comparison step:

```ts
// scheduler.ts:78-81
const todayMilestones = milestones.filter((m) => {
    const mTargetStr = m.targetDate.toISOString().split('T')[0]; // ← forces UTC
    return mTargetStr === subscriberDateStr;                     // ← subscriber-local string
});
```

`toISOString()` always renders in UTC. If the server's system/container timezone is UTC
(the common Docker default), local-Date-construction and UTC-rendering agree and this is
invisible. But self-hosters routinely set a `TZ` env var on their container for correct log
timestamps (a normal Docker practice this project doesn't warn against). The moment the
server's `TZ` has a non-zero offset, midnight-local gets rendered by `toISOString()` as the
*previous or next* UTC date, and `mTargetStr` silently stops matching `subscriberDateStr` —
or matches a day early. Net effect: milestone push notifications fire a day late, a day
early, or not at all, for every subscriber, and the failure mode is silent (no error, no
log) because `applied`/no-match looks identical to "not yet due."

**Failure scenario:** Deploy with `environment: TZ=Asia/Tokyo` (a real, common self-host
config) → every subscriber's "50 Days" / anniversary notification either never fires or
fires on the wrong calendar day, regardless of what timezone the subscriber themselves is in.

**Proposed resolution:** Compare using the same locale-formatting approach already used for
`subscriberDateStr`, not `toISOString()`:

```ts
// before (scheduler.ts:78-81)
const todayMilestones = milestones.filter((m) => {
    const mTargetStr = m.targetDate.toISOString().split('T')[0];
    return mTargetStr === subscriberDateStr;
});

// after
const todayMilestones = milestones.filter((m) => {
    const mTargetStr = `${m.targetDate.getFullYear()}-${pad(m.targetDate.getMonth() + 1)}-${pad(m.targetDate.getDate())}`;
    return mTargetStr === subscriberDateStr;
});
```
Since `m.targetDate` was itself built with local `Y/M/D` components from the same
process, reading it back via `getFullYear()/getMonth()/getDate()` (not `toISOString()`)
round-trips exactly regardless of server `TZ`. This is a one-line-shape fix, not a rewrite.

---

### 🟠 High

#### H1. `SettingsSheet.svelte` is a 1,212-line component with eight unrelated responsibilities
**File:** [`src/lib/components/settings/SettingsSheet.svelte`](src/lib/components/settings/SettingsSheet.svelte) (entire file)

One component currently owns: bond identity form (names/date/type), photo upload, UI theme
selection, color mode + palette selection, per-bond milestone-category preferences, the
milestone list + custom-milestone CRUD, device push-notification management (subscribe/test/
scheduler-trigger), storage-durability diagnostics, JSON backup/restore, full data reset,
and the app-version footer. It is reachable in four different modes (`isNewBond`,
`showAppWideSettings`, edit-existing, app-wide) controlled by prop combinations, which is
itself why the milestone-preference duplication in H2 exists — every write path needs an
`isNewBond` branch.

**Proposed resolution:** Split into an orchestrator + subcomponents, keeping `SettingsSheet`
as thin composition:

```
SettingsSheet.svelte (orchestrator: mode resolution + <Modal> wiring only)
├─ BondIdentityForm.svelte      (type, names, date, photo)
├─ ThemeSelector.svelte         (shared with OnboardingFlow — see H3)
├─ ColorModeSelector.svelte     (shared with OnboardingFlow — see H3)
├─ ColorPaletteSelector.svelte  (already array-driven at line 704; just extract)
├─ MilestonePrefsEditor.svelte  (fixes H2 as a side effect)
├─ MilestonesList.svelte        (filter tabs + list + custom-milestone add/delete)
├─ PushNotificationPanel.svelte (device push section, showAppWideSettings only)
├─ StorageBackupPanel.svelte    (storage estimate, persist request, backup/restore/reset)
```
Each subcomponent takes the bond/state it needs as props and emits changes via callback
props (`onchange`), matching the existing codebase convention (`ThemeProps.onOpenSettings`
etc.) — no new state-management pattern required.

---

#### H2. The same 10-line milestone-preference update block is repeated six times, verbatim except for one field
**File:** [`src/lib/components/settings/SettingsSheet.svelte`](src/lib/components/settings/SettingsSheet.svelte) — years block `:776-789`, months `:799-816`, "All Days" `:842-855`, "Major Only" `:866-879`, "Off" `:890-904`, custom `:919-936`

Each `onchange` handler re-derives all four `MilestoneCategoryPrefs` fields from
`currentBond.milestonePrefs` with the same fallback chain, changing only one field:

```ts
// repeated 6x, e.g. lines 779-788
handleLiveUpdate({
    milestonePrefs: {
        ...(currentBond.milestonePrefs || {}),
        years: v,                                                      // ← varies
        months: currentBond.milestonePrefs?.months ?? true,
        days: currentBond.milestonePrefs?.days ?? 'all',
        custom: currentBond.milestonePrefs?.custom ?? true
    }
});
```
This is a maintenance hazard, not just noise: the six copies already disagree on defaults
in a subtle way (the years/months/custom handlers default `months`/`days` to `true`/`'all'`
unconditionally, while the days-filter handlers default `months` to `true` but the *years*
default differs contextually) — they happen to be consistent today only because no one has
edited one copy without the other five since it was written.

**Proposed resolution:**
```ts
// before: 6 duplicated ~10-line blocks
// after:
function updateMilestonePrefs(patch: Partial<MilestoneCategoryPrefs>) {
    if (isNewBond) return;
    const base = currentBond.milestonePrefs ?? DEFAULT_MILESTONE_PREFS_ROMANTIC;
    void handleLiveUpdate({ milestonePrefs: { ...base, ...patch } });
}
// call sites become one-liners: updateMilestonePrefs({ years: v })
```
This becomes trivial once extracted into `MilestonePrefsEditor.svelte` per H1.

---

#### H3. Theme / color-mode / bond-type selector UI is duplicated verbatim between `SettingsSheet.svelte` and `OnboardingFlow.svelte`
**Files:** [`SettingsSheet.svelte:594-650`](src/lib/components/settings/SettingsSheet.svelte#L594) (theme) & `:657-697` (mode) & `:485-513` (bond type); [`OnboardingFlow.svelte:530-602`](src/lib/components/onboarding/OnboardingFlow.svelte#L530) (theme) & `:607-649` (mode) & `:386-419` (bond type)

Three independent UI blocks — the Modern/Cover/Traditional theme cards, the
System/Light/Dark mode buttons, and the Relationship/Friendship type cards — are
hand-written out three times each (once per option) in *both* files, with near-identical
Tailwind class strings. The codebase already demonstrates the right pattern twice over:
the accent-palette picker at `SettingsSheet.svelte:704` maps over a `palettes` array, and
`THEME_REGISTRY` in [`registry.ts`](src/lib/components/themes/registry.ts) already carries
`id`/`name`/`description` for exactly this purpose but isn't used to *drive* either selector
— both files hand-roll the same three cards it already describes.

**Proposed resolution:** Extract three small, array-driven components and have both
`SettingsSheet` and `OnboardingFlow` render them:

```svelte
<!-- ThemeSelector.svelte — sketch -->
<script lang="ts">
  import { THEME_REGISTRY } from '$lib/components/themes/registry';
  let { value, onchange }: { value: UIThemeId; onchange: (v: UIThemeId) => void } = $props();
</script>
<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
  {#each THEME_REGISTRY as t}
    <button type="button" class={value === t.id ? SELECTED_CLASS : UNSELECTED_CLASS}
      onclick={() => onchange(t.id)}>
      <span>{t.name}</span>{#if value === t.id}<Check class="h-4 w-4" />{/if}
    </button>
  {/each}
</div>
```
`ColorModeSelector` and `BondTypeSelector` follow the same shape against small local
option arrays. This directly eliminates H2-style drift risk for these three pickers too.

---

#### H4. Share-payload decoding is independently reimplemented in three files
**Files:** [`src/lib/stores/profile.svelte.ts:555-567`](src/lib/stores/profile.svelte.ts#L555) (`parseSharePayload`), [`src/lib/components/share/ScanImportModal.svelte:172-188`](src/lib/components/share/ScanImportModal.svelte#L172) (`handleImportData`), [`src/routes/+page.svelte:56-67`](src/routes/+page.svelte#L56) (hash-import `$effect`)

All three independently implement the identical three-branch decision: "does the string
contain `#import=`? does it start with `{`? otherwise try `atob()`." This is exactly the
kind of parsing logic — untrusted input from a URL, camera scan, or pasted text — that
should have exactly one implementation, so a correctness or security fix (e.g. tightening
what counts as valid base64, or adding a size cap) has to be remembered in three places or
it silently doesn't apply everywhere. It has already drifted once: `+page.svelte` calls
`decodeURIComponent` before invoking `parseSharePayload`, while `ScanImportModal` lets
`parseSharePayload`'s own internal branch do it — both happen to produce the same result
today only because of how the two branches interact, not because it's guaranteed.

**Proposed resolution:** Extract a single function, e.g. `$lib/utils/share.ts`:
```ts
export function decodeSharePayloadString(raw: string): string {
    if (raw.includes('#import=')) return atob(decodeURIComponent(raw.split('#import=')[1]));
    if (raw.startsWith('{')) return raw;
    try { return atob(raw); } catch { return raw; }
}
```
`parseSharePayload` becomes `JSON.parse(decodeSharePayloadString(rawOrJson))` wrapped in its
existing try/catch; `ScanImportModal.handleImportData` and the `+page.svelte` hash effect
call the same function instead of re-deriving `jsonString` locally.

---

#### H5. `ModernTheme.svelte` and `CoverTheme.svelte` duplicate ~90% of their structure
**Files:** [`src/lib/components/themes/ModernTheme.svelte`](src/lib/components/themes/ModernTheme.svelte) (194 lines), [`src/lib/components/themes/CoverTheme.svelte`](src/lib/components/themes/CoverTheme.svelte) (170 lines)

Both themes render, in the same order: a settings/name-switcher/share header, a
`SyncStatusPill`, a hero counter `Card` (badge + `primaryFormatted` + optional seconds),
a 4-cell stat grid (Months/Weeks/Days/Hours — same icons, same order), and a next-milestone
progress card. The settings/share icon buttons (`ModernTheme.svelte:17-24,42-49` vs.
`CoverTheme.svelte:45-52,71-78`) are byte-identical. The stat grid and milestone card are
structurally identical but use different spacing/text-size tokens (`p-4`/`text-xl` vs.
`p-3.5`/`text-lg`) to fit Cover's more compact bottom-anchored layout — see the UI Impact
Log (§4) before touching these.

**Proposed resolution:**
```
ThemeIconButton.svelte      — settings/share circular buttons (byte-identical today)
StatBreakdownGrid.svelte    — 4-cell grid, variant="default" | "compact" prop for the
                               p-4/text-xl vs p-3.5/text-lg difference
NextMilestoneCard.svelte    — variant prop for the same reason
HeroCounterCard.svelte      — badge + primaryFormatted + optional seconds row
```
`ModernTheme`/`CoverTheme`/`TraditionalTheme` keep their own header layout and photo
treatment (these are genuinely different per theme and should stay theme-specific) but
compose the four pieces above instead of hand-rolling each one.

---

### 🟡 Medium

#### M1. Zero automated tests in the repository
No `*.test.ts`, `*.spec.ts`, or test runner (`vitest`, `playwright`, etc.) exists in
`package.json` or the tree. The highest-value, easiest-to-test units in the codebase are
exactly the ones this audit is most confident are currently correct *by careful reading*
rather than by verification: `coalesce()` in [`outbox.ts:94-129`](src/lib/storage/outbox.ts#L94),
`calculateMilestones()`/`getCalendarDifference()` in [`time.ts`](src/lib/utils/time.ts), and
`applySyncOps`'s last-write-wins branching in [`server/sync.ts:128-190`](src/lib/server/sync.ts#L128).
C1 above is the kind of bug a single `calculateMilestones` + timezone-mocked test would have
caught immediately.

**Proposed resolution:** Add `vitest` and start with pure-function coverage only (no DOM,
no IndexedDB mocking needed) for `time.ts` and `outbox.ts`'s `coalesce()` — both are already
side-effect-free. This is additive and carries zero risk to existing behavior.

#### M2. `importJSON()`'s three branches duplicate bond-normalization logic already duplicated a fourth time in `parseSharePayload`
**File:** [`src/lib/stores/profile.svelte.ts:417-547`](src/lib/stores/profile.svelte.ts#L417) (`importJSON`), `:553-599` (`parseSharePayload`)

The V2-full-backup branch (`:426-445`), the V2-single-bond branch (`:463-482`), and the
V1-legacy branch (`:517-531`) each rebuild a `Bond`-shaped object with the same
`milestonePrefs` fallback chain (`b.milestonePrefs?.years ?? true`, etc., repeated four
times counting `parseSharePayload`). A bug in one fallback (e.g. friendship defaults) has to
be fixed in up to four places.

**Proposed resolution:** Extract `normalizeIncomingBond(raw, fallbackContext): Bond` (or
`Partial<Bond>` for the preview-only `parseSharePayload` use) and call it from all four
sites. Pure refactor — no behavior change, since the fallback chains are (currently)
consistent across the four copies.

#### M3. `loadAppStateFromStorage()` fetches per-bond photo blobs sequentially
**File:** [`src/lib/storage/db.ts:76-104`](src/lib/storage/db.ts#L76-L104)

The `for (const rawBond of rawState.bonds)` loop does `await get<Blob>(...)` once per bond,
serially. For a user with several bonds this adds one IndexedDB round-trip's latency per
bond to every app cold start. Not a correctness issue — flagged as a straightforward
`Promise.all` opportunity:
```ts
// before: sequential await inside the loop
// after:
const bonds = await Promise.all(rawState.bonds.map(async (rawBond) => { ...same body... }));
```

#### M4. `ScanImportModal` rejects valid full multi-bond backups with a misleading error
**Files:** [`src/lib/components/share/ScanImportModal.svelte:190-194`](src/lib/components/share/ScanImportModal.svelte#L190), [`src/lib/stores/profile.svelte.ts:553-599`](src/lib/stores/profile.svelte.ts#L553)

`ScanImportModal` gates on `parseSharePayload(raw)` returning non-null before proceeding,
but `parseSharePayload` only recognizes the single-bond-invite and V1-legacy shapes — it has
no branch for the full V2 `{ version: 2, bonds: [...] }` backup format that
`profileStore.importJSON()` (called two lines later, and used directly by the "Restore from
JSON Backup" flow in `SettingsSheet.svelte:390-402`) fully supports. A user who pastes their
own "Download JSON Backup (All Bonds)" file into the "Paste Link / Code" tab gets
`"Invalid relationship profile format"` for objectively valid, well-formed JSON this same
codebase can import elsewhere.

**Proposed resolution:** Once M2's `normalizeIncomingBond` extraction exists, give
`parseSharePayload` (or a renamed, broadened equivalent) a branch for `data.version === 2 &&
Array.isArray(data.bonds)`, mirroring `importJSON`'s own first branch, so both entry points
accept the same set of formats.

#### M5. `OnboardingFlow.svelte` is a 696-line monolithic step switch
**File:** [`src/lib/components/onboarding/OnboardingFlow.svelte`](src/lib/components/onboarding/OnboardingFlow.svelte)

All six wizard steps (`overview`, `pwa_install`, `names`, `date`, `photo`, `style`) are
inline `{#if currentStepKey === '...'}` blocks in one template, each 50-150 lines. Once H3
extracts the shared selector components used in the `style` step, splitting each step into
its own `OnboardingStep*.svelte` (taking the relevant `$state` as bindable props) becomes
straightforward and reduces this file to a thin stepper shell, matching the pattern already
proposed for `SettingsSheet` in H1.

---

### 🟢 Low

#### L1. Dead code: four unused legacy storage wrapper functions
**File:** [`src/lib/storage/db.ts:303-348`](src/lib/storage/db.ts#L303-L348)

`loadProfileFromStorage`, `saveProfileToStorage`, `savePhotoBlob`, and
`clearProfileStorage` are exported but have no importers anywhere in `src/` (verified via
project-wide grep). They appear to be pre-multi-bond (V1) compatibility shims that were
superseded by `loadAppStateFromStorage`/`saveAppStateToStorage`/`saveBondPhoto`/
`clearAllStorage` but never removed.

**Proposed resolution:** Delete all four functions and their JSDoc block once confirmed
unused by a final `grep -r` immediately before removal (safe — no external package consumes
this app's internals).

#### L2. Fragile custom-milestone ID round-trip via string prefix stripping
**Files:** [`SettingsSheet.svelte:282`](src/lib/components/settings/SettingsSheet.svelte#L282) (creation), [`time.ts:244`](src/lib/utils/time.ts#L244) (display wrapping), [`SettingsSheet.svelte:1007`](src/lib/components/settings/SettingsSheet.svelte#L1007) (deletion)

`addCustomMilestone` creates milestones with `id: custom_${Date.now()}`. `calculateMilestones`
re-wraps every custom milestone's display ID as `` `custom_${custom.id}` `` (double-prefixing
it, e.g. `custom_custom_1735000000000`), and the delete handler strips it back with
`m.id.replace('custom_', '')` — which removes only the *first* occurrence, coincidentally
landing back on the original ID. This currently works only because both prefixing sites
independently agree on the literal string `'custom_'` and the delete handler relies on
`.replace()`'s single-match behavior rather than an explicit unwrap. Any future change to
either prefix (e.g. namespacing IDs per-bond) breaks deletion silently.

**Proposed resolution:** Give `MilestoneItem` an explicit `sourceId` field distinct from its
display `id`, so `deleteCustomMilestone` matches on `sourceId` directly instead of
string-mangling the display ID. Small, contained change to `time.ts`'s custom-milestone
branch (`:236-254`) and the one call site.

#### L3. `checkAndDispatchMilestones` recomputes the full ~63-entry milestone list every hour for every subscription × bond
**File:** [`src/lib/server/scheduler.ts:76`](src/lib/server/scheduler.ts#L76)

`calculateMilestones()` is called with the full milestone catalog every run, then filtered
down to "today only." At self-hosted scale (a handful to low hundreds of couples) this is
not a measurable bottleneck, but it's worth noting alongside C1 since both live in the same
function — a targeted "does date X land today" check would be both cheaper and immune to
C1's UTC-conversion trap by construction. Low priority; consider only if C1 is being fixed
anyway.

---

## 3. Refactoring & Extraction Plan

| New module | Extracted from | Resolves |
|---|---|---|
| `src/lib/components/settings/BondIdentityForm.svelte` | `SettingsSheet.svelte` | H1 |
| `src/lib/components/settings/MilestonePrefsEditor.svelte` | `SettingsSheet.svelte` | H1, H2 |
| `src/lib/components/settings/MilestonesList.svelte` | `SettingsSheet.svelte` | H1 |
| `src/lib/components/settings/PushNotificationPanel.svelte` | `SettingsSheet.svelte` | H1 |
| `src/lib/components/settings/StorageBackupPanel.svelte` | `SettingsSheet.svelte` | H1 |
| `src/lib/components/shared/ThemeSelector.svelte` | `SettingsSheet.svelte` + `OnboardingFlow.svelte` | H3 |
| `src/lib/components/shared/ColorModeSelector.svelte` | `SettingsSheet.svelte` + `OnboardingFlow.svelte` | H3 |
| `src/lib/components/shared/ColorPaletteSelector.svelte` | `SettingsSheet.svelte` (already array-driven, just move) | H3 |
| `src/lib/components/shared/BondTypeSelector.svelte` | `SettingsSheet.svelte` + `OnboardingFlow.svelte` | H3 |
| `src/lib/utils/share.ts` (`decodeSharePayloadString`) | `profile.svelte.ts` + `ScanImportModal.svelte` + `+page.svelte` | H4 |
| `src/lib/components/themes/shared/ThemeIconButton.svelte` | `ModernTheme.svelte` + `CoverTheme.svelte` | H5 |
| `src/lib/components/themes/shared/StatBreakdownGrid.svelte` | `ModernTheme.svelte` + `CoverTheme.svelte` | H5 |
| `src/lib/components/themes/shared/NextMilestoneCard.svelte` | `ModernTheme.svelte` + `CoverTheme.svelte` | H5 |
| `src/lib/components/themes/shared/HeroCounterCard.svelte` | `ModernTheme.svelte` + `CoverTheme.svelte` | H5 |
| `normalizeIncomingBond()` in `profile.svelte.ts` | inline in `importJSON` + `parseSharePayload` | M2, M4 |
| `updateMilestonePrefs()` helper | inline in `SettingsSheet.svelte` | H2 (folds into `MilestonePrefsEditor.svelte`) |
| `src/lib/components/onboarding/steps/*.svelte` (6 files) | `OnboardingFlow.svelte` | M5 |

**Unifying interfaces:**
- `ThemeSelector` / `ColorModeSelector` / `BondTypeSelector` all take `{ value, onchange,
  disabled? }` — matching the existing `onchange`-callback-prop convention already used by
  `Switch` (`$lib/components/ui/switch`) throughout the codebase, not a new pattern.
- `StatBreakdownGrid` / `NextMilestoneCard` take `{ timeBreakdown, nextMilestone?, variant:
  'default' | 'compact' }` so `ModernTheme` and `CoverTheme` pass their existing exact class
  tokens through the variant rather than the component guessing spacing.

No change to `ThemeProps`, `AppState`, `Bond`, `SyncOp`, or any Prisma model is required for
any item above.

---

## 4. UI & State Impact Log

- **H1 (`SettingsSheet` split), H3 (selectors), M2 (`normalizeIncomingBond`), M5 (onboarding
  steps), H4 (`decodeSharePayloadString`), L1 (dead code), M3 (`Promise.all`), L2 (milestone
  ID field):** **Zero UI Impact.** These are pure structural/logic extractions with no
  intended change to rendered markup, CSS classes, or user-facing behavior.

- **H2 (`updateMilestonePrefs` helper):** **Zero UI Impact** if the six call sites' current
  fallback values are preserved exactly as-is during extraction (they are consistent across
  all six copies today — verified during this audit).

- **H5 (`StatBreakdownGrid` / `NextMilestoneCard` / `HeroCounterCard` shared components):**
  **Requires visual parity verification, not zero-impact-by-default.** `ModernTheme` and
  `CoverTheme` use different Tailwind tokens for the "same" cards (`p-4`/`text-xl`/`gap-3`
  vs. `p-3.5`/`text-lg`/`gap-2.5`, icon sizing `h-5 w-5` vs `h-4 w-4`, added
  `backdrop-blur-md` and `min-w-0` on Cover's cards). The extraction must carry both sets of
  classes through as an explicit `variant` prop and be screenshot-diffed against both themes
  before/after — an agent executing this phase should treat "pixel-identical to current
  output" as the acceptance bar, not "looks similar." `ThemeIconButton` (the settings/share
  buttons) is the one piece in H5 confirmed byte-identical between the two files today.

- **M4 (`ScanImportModal` accepting full V2 backups):** **Intentional, user-visible behavior
  change** (a previously-rejected input now succeeds) — flagged for product sign-off, not
  purely a refactor. Recommend shipping as a separate, explicitly-labeled change rather than
  folding it into the H4/M2 refactor commits.

- **C1 (scheduler timezone fix):** **No UI impact**, but is a **behavior change for
  self-hosted deployments running with a non-UTC container `TZ`** — some subscribers on such
  deployments may receive a milestone notification "for the first time" on a date they
  previously silently missed. Recommend calling this out in the release notes for whichever
  version ships the fix.

---

## 5. Implementation Roadmap

Ordered so each phase is independently shippable and later phases depend only on earlier
ones, not on each other.

### Phase 0 — Safety net (do first, before any structural change) — ✅ DONE (2026-08-27)
- [x] Add `vitest` as a dev dependency and a `test` script.
      → `vitest@4.1.11` added to `devDependencies`; `package.json` scripts gained
      `"test": "vitest run"` and `"test:watch": "vitest"`; `vitest.config.ts` added,
      reusing the `sveltekit()` plugin (from `vite.config.ts`) solely for `$lib` alias
      resolution, scoped to `src/**/*.test.ts` only — no DOM environment configured,
      since every test target here is a pure function.
- [x] Write unit tests for `calculateMilestones()` / `getCalendarDifference()`
      (`src/lib/utils/time.ts`), including a case that pins down C1's expected fixed
      behavior under a mocked non-UTC server timezone.
      → `src/lib/utils/time.test.ts` (18 tests): `getCalendarDifference` borrow/edge
      cases, `formatLongDate`, `calculateTimeBreakdown` totals/formatting, and
      `calculateMilestones` filters/achieved-state/next-milestone progress. A
      dedicated `describe` block mocks `process.env.TZ` (verified to take effect
      per-`Date`-construction on this Node version, not just at process start) to
      pin down C1: it asserts `targetDate`'s local Y/M/D getters always give the
      correct calendar date, while `targetDate.toISOString()` — what
      `scheduler.ts:78-81` currently compares against — diverges under a
      positive-UTC-offset zone (Asia/Tokyo) and agrees only under UTC. This encodes
      the *expected* fixed-comparison behavior for Phase 1 without modifying
      `scheduler.ts` itself, which stays out of Phase 0's scope.
- [x] Write unit tests for `coalesce()` (`src/lib/storage/outbox.ts`).
      → `src/lib/storage/outbox.test.ts` (12 tests): upsert deduplication, delete
      superseding, re-subscribe-after-delete, `oldEndpoint` carry-forward and
      override, migrated-away endpoint dropping, cross-endpoint independence, and
      `attempts` max-carrying. Confirmed safe to import `outbox.ts` under Node
      without IndexedDB — `idb-keyval`'s `createStore()` is lazy and only touches
      the `indexedDB` global on an actual CRUD call, which these tests never make.
- [x] Write unit tests for `applySyncOps`'s LWW branching (`src/lib/server/sync.ts`),
      mockable since it only depends on the injected `prisma` client.
      → `src/lib/server/sync.test.ts` (9 tests): create-on-first-upsert, newer-upsert
      applies with bond add/update/remove diffing, older-upsert rejected stale
      without mutation, endpoint-rotation migrates the row in place and preserves
      `lastNotified`, stale rotation rejected without migrating, rotation with a
      missing `oldEndpoint` source falls back to create, and delete
      idempotency/staleness. `./db` (which opens a real SQLite file as an import
      side effect) is replaced via `vi.mock` with an in-memory fake implementing
      just the Prisma Client surface `sync.ts` calls — no real database touched.
- [x] Verification: `pnpm test` → 3 files, 39/39 tests passing. `pnpm check`
      (`svelte-kit sync && svelte-check`) → 0 errors, 0 warnings across 4,268 files.
*(Resolves M1; gives every later phase a regression check.)*

### Phase 1 — Isolated bug fix — ✅ DONE (2026-08-27)
- [x] Fix C1: replace the `toISOString()` comparison in
      `checkAndDispatchMilestones` (`scheduler.ts:78-81`) with a local-component date
      string, per the sketch in C1. Add the regression test from Phase 0 if not already
      covering it.
      → Added a `toLocalDateString()` helper in `scheduler.ts` (Y/M/D getters, no UTC
      conversion) and swapped it in at the one comparison site
      (`checkAndDispatchMilestones`'s `todayMilestones` filter). No other logic in the
      file changed.
      → Phase 0's `time.test.ts` pinned the *expected* comparison behavior but didn't
      exercise `scheduler.ts` itself, so a dedicated regression suite was added:
      `src/lib/server/scheduler.test.ts` (3 tests), mocking `./db` and `./push` with
      an in-memory fake (same `vi.hoisted` pattern as `sync.test.ts`) and using
      `vi.setSystemTime` to fix "now". Covers: (1) a milestone due "today" in UTC is
      correctly detected as due when the server process runs with `TZ=Asia/Tokyo`
      (UTC+9 — the exact offset class C1 breaks), (2) the same scenario still works
      under `TZ=UTC` (no regression for the common Docker default), (3) a bond whose
      `lastNotified` already records today's key is not re-notified (fix doesn't
      break idempotency).
      → **Verified the regression test actually catches the bug**: temporarily
      reverted the one-line fix, confirmed `detects a same-UTC-day milestone as due
      even when the server process runs in a positive-UTC-offset timezone` fails
      (`expected +0 to be 1`) against the old code, then restored the fix and
      confirmed all tests pass again.
      → Verification: `pnpm test` → 4 files, 42/42 passing. `pnpm check` → 0 errors,
      0 warnings across 4,269 files.
*(Shipped independently — zero dependency on any other phase.)*

### Phase 2 — Shared core utilities (no visual change) — ✅ DONE (2026-08-27)
- [x] Extract `decodeSharePayloadString()` into `src/lib/utils/share.ts`; update
      `parseSharePayload`, `ScanImportModal.handleImportData`, and the `+page.svelte` hash
      effect to call it. *(H4)*
      → New `src/lib/utils/share.ts` with the single three-branch decode. All three
      call sites now import it instead of re-deriving the same logic; `+page.svelte`'s
      copy (which used to inline just the "already-URI-decoded, try atob else raw"
      half) now calls the identical function the other two use — the double-decode
      redundancy noted in the audit is gone, not just the duplication.
- [x] Extract `normalizeIncomingBond()` in `profile.svelte.ts`; update `importJSON`'s three
      branches and `parseSharePayload` to use it. *(M2)*
      → Added as a module-private helper taking `(bondType, raw, envelope = raw)` and
      returning everything a `Bond` needs except `id`/`notificationsEnabled` — the two
      fields that genuinely vary per call site (an invite always forces
      `notificationsEnabled: true` and mints a fresh `id`; a full backup preserves
      both). `bondType` is an explicit parameter rather than read off `raw.type`, so a
      V1-legacy payload with a stray `type` field still can't leak through. Verified
      field-by-field against all 5 original call sites before editing — every current
      fallback value is reproduced exactly, including cases where a fallback the
      shared function computes is provably unreachable at that call site (e.g.
      V1-legacy's `names`/`togetherSince` are guarded truthy upstream, so the shared
      function's generic default never fires there). Added `src/lib/stores/profile.test.ts`
      (6 tests) as empirical proof of this, exercising `parseSharePayload` — the one
      already-exported function that routes through the new helper — across the
      `#import=` URL, bare-JSON, base64-sync-code, and V1-legacy input shapes,
      including a test that a stray `type` field on a V1 payload does NOT change the
      resolved bond type.
- [x] Parallelize the photo-blob fetch loop in `loadAppStateFromStorage`. *(M3)*
      → `for` loop replaced with `Promise.all(rawState.bonds.map(async (rawBond) => ...))`
      in `storage/db.ts`. `Promise.all` preserves input order in its results regardless
      of resolution timing, so `bonds[0]`'s use as an `activeBondId` fallback is unaffected.
- [x] Delete the four dead legacy wrapper functions in `storage/db.ts`, after a final grep
      confirms no importers. *(L1)*
      → Re-ran the grep immediately before deleting (still zero importers outside their
      own declarations) and removed `loadProfileFromStorage`, `saveProfileToStorage`,
      `savePhotoBlob`, `clearProfileStorage`.
- [x] Give `MilestoneItem` a `sourceId` field; fix `deleteCustomMilestone` to use it instead
      of string-stripping. *(L2)*
      → `MilestoneItem.sourceId?: string` added in `types/time.ts`; `calculateMilestones`'s
      custom-milestone branch sets it to the original `CustomMilestone.id` (undecorated);
      `SettingsSheet.svelte`'s delete button now calls `deleteCustomMilestone(m.sourceId!)`
      instead of `m.id.replace('custom_', '')`. Extended the existing Phase-0 custom-milestone
      test in `time.test.ts` to assert `sourceId` directly.
- [x] Added `src/lib/utils/share.test.ts` (4 tests) for the new `decodeSharePayloadString`
      — not on the original checklist, but cheap, low-risk, and directly de-risks H4 the
      same way the M2 tests de-risk that extraction.
- [x] Verification: `pnpm test` → 6 files, 52/52 passing. `pnpm check` → 0 errors,
      0 warnings across 4,272 files. `pnpm build` → succeeds end-to-end, including
      `verify-precache.js`'s assertion that the service worker is still DOM-free
      (39 precache entries; Invariant 7 unaffected — none of this phase's changes are
      imported by `service-worker.ts`).

### Phase 3 — Shared selector components (Settings + Onboarding) — ✅ DONE (2026-08-27)
- [x] Build `ThemeSelector.svelte`, `ColorModeSelector.svelte`, `ColorPaletteSelector.svelte`,
      `BondTypeSelector.svelte` in `src/lib/components/shared/`.
      → Built with explicit `layout`/`variant`/`showLabel` props rather than deriving
      copy from `THEME_REGISTRY`: side-by-side comparison of the two original files
      turned up *three* different sets of theme label/description copy (Settings',
      Onboarding's, and `THEME_REGISTRY`'s own), plus real structural differences
      (Onboarding's theme cards show a per-theme icon and a circular check badge;
      Settings' show neither) that a single unstyled array-map would have collapsed
      to one — silently changing what one or both call sites display. Each component
      reproduces both call sites' exact prior markup, gated by the layout prop.
- [x] Wire them into `OnboardingFlow.svelte`'s `style`/`names` steps first (lower risk,
      fewer call sites) and verify visually.
      → Caught one real mistake here before it shipped: `ThemeSelector`'s first draft
      hardcoded a "UI Style Theme" label that Settings shows but Onboarding's original
      markup never did (only an HTML comment). Found via side-by-side diff against
      the original before visual testing, fixed by adding a `showLabel` prop
      (defaulting to Settings' `true`, passed `false` from Onboarding) — the same
      pattern already used for `BondTypeSelector`/`ColorModeSelector`.
      → Also removed 5 now-dead icon imports (`Sun`, `Moon`, `Monitor`, `Image`, plus
      pre-existing-dead `Lock`) from `OnboardingFlow.svelte` while editing that
      import block anyway.
- [x] Wire them into `SettingsSheet.svelte`, verify visually in all four modes
      (`isNewBond` × `showAppWideSettings`).
      → Removed the now-dead local `palettes` array (moved into
      `ColorPaletteSelector`) and 5 now-dead icon imports (`Sun`, `Moon`, `Monitor`,
      `Check`, `Image`).
      → **Visual verification**: no project-specific run skill existed, so drove a
      real headless Chromium session (Playwright, installed fresh into the
      scratchpad — not added to the project) through the full onboarding wizard
      (names → date → photo → style, exercising `ThemeSelector`'s `detailed` layout
      and `ColorModeSelector`'s labeled layout) and then the Settings sheet on the
      resulting profile (exercising `BondTypeSelector`, `ThemeSelector`'s `compact`
      layout, `ColorModeSelector`'s unlabeled layout, and `ColorPaletteSelector`).
      Screenshotted every selection state, read back the actual DOM `className` of
      the bond-type and palette buttons after clicking to confirm selected-state
      classes land on the right element (not just "looks right" in a screenshot),
      and captured `console`/`pageerror` events — zero across the whole flow. One
      false alarm along the way: an early screenshot appeared to show the wrong
      bond-type card highlighted after a click, traced to the test script's own
      fuzzy `text=` selector matching decaying confetti/description text rather
      than the button (confirmed by reading back element classes directly) — not
      an application bug. Also confirmed end-to-end that theme/mode/palette
      selections made during onboarding correctly persist and render in the actual
      themed view afterward (screenshotted the dark Traditional theme after
      selecting it in the wizard).
- [x] Verification: `pnpm check` → 0 errors, 0 warnings across 4,276 files.
      `pnpm test` → 6 files, 52/52 passing (unaffected, as expected — this phase
      touched no tested logic files).
*(H3; depended on nothing from Phase 2, ran after it.)*

### Phase 4 — `SettingsSheet` decomposition — ✅ DONE (2026-08-27)
- [x] Extract `MilestonePrefsEditor.svelte` with the `updateMilestonePrefs()` helper. *(H2)*
      → Implemented as `updatePrefs(patch)`: verified field-by-field against all six
      original handlers before extracting — each original handler's explicit
      `?? true` / `?? 'all'` fallback fields were dead code whenever
      `currentBond.milestonePrefs` is defined (spreading it already supplied those
      exact values), so `{ ...(currentBond.milestonePrefs ?? DEFAULT_MILESTONE_PREFS_ROMANTIC), ...patch }`
      reproduces all six byte-for-byte, including the one non-obvious original
      quirk preserved deliberately: the type-optional-field fallback branch (when
      `currentBond.milestonePrefs` is itself undefined) always defaults to
      *romantic* prefs regardless of the bond's actual type — matching the
      original's own inconsistency rather than "fixing" it into a behavior change.
      Also owns `notificationsEnabled` and the master toggle (the section they
      gate together), using `$bindable()` for the five draft fields the parent
      still needs for `handleCreateNewBond`.
- [x] Extract `BondIdentityForm.svelte`, `MilestonesList.svelte`,
      `PushNotificationPanel.svelte`, `StorageBackupPanel.svelte`.
      → `MilestonesList` and `PushNotificationPanel` turned out fully
      self-containable: both are only ever mounted for an existing bond
      (`{#if !isNewBond}` / `{#if showAppWideSettings && !isNewBond}` in the
      parent), so their `isNewBond` ternaries and guards — dead branches at their
      only real call site — were dropped rather than threaded through as props,
      and each now calls `profileStore.updateBond`/push functions directly instead
      of via the parent's `handleLiveUpdate` wrapper. `StorageBackupPanel` keeps an
      `open` prop specifically because `Modal.svelte` keeps children mounted
      through its own ~260ms close animation before tearing them down — a plain
      mount-effect would have subtly changed the storage-estimate refresh's
      re-fire timing on rapid reopen; threading `open` through preserves the
      original effect's exact dependency-driven semantics instead.
- [x] Reduce `SettingsSheet.svelte` to mode resolution + composition of the above. *(H1)*
      → 1,212 lines → 393. Retains only: props/mode resolution, the draft `$state`
      needed across multiple children plus `handleCreateNewBond`, the sync-on-open
      `$effect`, and composition of the five extracted components plus the
      Phase 3 selectors (Theme/Color Appearance section wasn't in this phase's
      extraction list, so it stays inline using `ThemeSelector`/
      `ColorModeSelector`/`ColorPaletteSelector` directly, as before).
- [x] **Visual verification across all four `isNewBond` × `showAppWideSettings`
      combinations** — actually three: `(true, true, false)`≡main gear icon,
      `(false, true)`≡switcher "Add", `(false, false)`≡switcher "Edit" cover every
      reachable state; `showAppWideSettings=true` with `isNewBond=true` is a valid
      prop combination but is never actually wired to any button in the app, so
      it was out of scope to test. Drove a full Playwright flow through all three:
      toggled a day-milestone filter button and read back its actual DOM class
      list (confirming the H2 `updatePrefs` merge produces the right selected
      state, not just a plausible-looking screenshot); added and then deleted a
      custom milestone, checking `isVisible()` before and after (confirms
      `MilestonesList`'s self-contained `profileStore.updateBond` calls persist
      correctly); created a second bond through the `isNewBond` form and verified
      it appeared correctly in the switcher with the right computed day-count;
      opened scoped-edit mode with two bonds and confirmed via `isVisible()` (not
      just a screenshot) that "Delete Bond" is shown. Zero console/page errors
      across the entire flow. One test-script-only false alarm, caught and
      resolved without touching app code: a screenshot taken immediately after
      opening the new-bond modal (`BondSwitcherDrawer` opens `SettingsSheet` as a
      second stacked `Modal` on top of itself — pre-existing design, untouched
      here) appeared to show the wrong content because the
      screenshot raced the modal's own open transition; a longer settle wait
      produced a clean, correct screenshot confirming no actual issue.
- [x] Verification: `pnpm check` → 0 errors, 0 warnings across 4,281 files.
      `pnpm test` → 6 files, 52/52 passing. `pnpm build` → succeeds end-to-end,
      `verify-precache.js` confirms the service worker is still DOM-free.

### Phase 5 — Onboarding decomposition — ✅ DONE (2026-08-27)
- [x] Split `OnboardingFlow.svelte`'s six steps into `src/lib/components/onboarding/steps/`.
      → `OnboardingFlow.svelte`: 696 → 228 lines. Created `OverviewStep.svelte`,
      `PwaInstallStep.svelte`, `NamesStep.svelte`, `DateStep.svelte`,
      `PhotoStep.svelte`, `StyleStep.svelte` (46–112 lines each).
      → State ownership followed the same rule as Phase 4: a step keeps its state
      locally only when nothing outside it needs to read or react to it.
      `PhotoStep` and the push-opt-in half of `StyleStep` turned out fully
      self-contained (`fileInputRef`, `pushOptedIn`/`pushLoading` moved in
      wholesale). `installSuccess` stayed a prop rather than moving into
      `PwaInstallStep`, because the wizard's *footer* — rendered by the parent,
      one step removed from the step content — also reads it for the
      "Continue"/"Continue in Browser" label; moving it in would have required
      either duplicating it or threading it back out, so it was left where both
      readers can see it. `selectedTheme`/`selectedColorMode` likewise stayed
      parent-owned props (not `$bindable`) specifically because
      `handleThemeChange`/`handleColorModeChange` also live-apply the pick via
      `profileStore.setUITheme`/`setColorMode` as the user browses — a side effect
      that has to keep running wherever the state lives, so the existing handlers
      were passed down as callback props unchanged rather than rebuilt.
      `namesInput`/`dateInput` did move to `$bindable()` (no such side effect to
      preserve, and `bind:value` was already the pattern their own `Input`
      children used).
- [x] **Visual verification**: drove the full six-step wizard end-to-end in a real
      browser (Playwright) — confirmed the step counter reads "Step 1 of 6" /
      "Step 6 of 6" correctly (proving `pwa_install` is still counted when not
      standalone), toggled Bond Type on the Names step and confirmed *both* the
      heading ("Your Names" → "Friend Names") and the cross-field names-swap side
      effect (input value flipped to "Alex & Sam") still fire correctly through
      the new `onBondTypeChange` callback, walked Date/Photo/Style, finished
      onboarding, then reopened Settings and confirmed the exact name and date
      typed during onboarding ("Verify Six" / "2017-11-11") round-tripped
      correctly through `finishOnboarding()`. Zero console/page errors across the
      entire flow.
- [x] Verification: `pnpm check` → 0 errors, 0 warnings across 4,287 files.
      `pnpm test` → 6 files, 52/52 passing. `pnpm build` → succeeds end-to-end,
      service worker confirmed still DOM-free.
*(M5; depended on Phase 3 since the `style` step consumes the shared selectors.)*

### Phase 6 — Theme component unification (requires visual sign-off per §4) — ✅ DONE (2026-08-27)
- [x] Extract `ThemeIconButton.svelte` (confirmed byte-identical; lowest risk in this phase).
      → Takes an `icon: LucideIcon` prop (the `LucideIcon` type alias already
      exported by `@lucide/svelte`, so no new type had to be hand-rolled) and a
      `shrink?: boolean` for the one genuine difference: Cover's copies carry
      `shrink-0` (needed because Cover's header has a `flex-1 min-w-0` name
      button between them, which would otherwise compress them under
      flexbox's default `flex-shrink: 1`); Modern's don't.
- [x] Extract `HeroCounterCard.svelte`, `StatBreakdownGrid.svelte`, `NextMilestoneCard.svelte`
      with an explicit `variant` prop; screenshot-diff `ModernTheme` and `CoverTheme` before
      and after against a fixed test bond/date.
      → `ModernTheme.svelte`: 194 → 122 lines. `CoverTheme.svelte`: 170 → 98 lines.
      Every Tailwind token difference documented in the plan's UI Impact Log
      (padding, text size, icon size, `backdrop-blur-md`, `min-w-0`, `truncate`,
      `shrink-0` on the days-left label) was carried through as a `variant:
      'default' | 'compact'`-keyed value — none were unified.
      → **Screenshot-diff, done as an actual pixel-level quantitative comparison,
      not a visual eyeball check**: captured full-page screenshots of both
      themes × both bond types × both `showSeconds` states (5 states total)
      against a fixed test bond/date, both before and after the extraction, using
      Playwright's `clock.setFixedTime()` (not `clock.install()+pauseAt()`,
      which was tried first and broke `Modal.svelte`'s entrance transition by
      also freezing the `requestAnimationFrame` it depends on — caught via a
      "element outside of viewport" failure, switched to the lighter API that
      only stubs `Date.now()`/`new Date()` and leaves real timers running) plus
      an injected `animation-duration: 0s !important` stylesheet to kill the
      Clock icon's continuous spin (its rotation angle at capture time is
      otherwise wall-clock-dependent and would never match between two separate
      page loads). `canvas-confetti`'s decay was the one source of noise CSS
      freezing couldn't touch (it's a canvas/JS particle sim, not
      CSS-animation-driven) — waited 5s for it to fully clear before any
      capture, since its particle positions are randomized per burst and would
      never diff-match between runs. Diffed all 5 before/after pairs with
      `pixelmatch`: **0 of 378,000 pixels differed, in every one of the 5
      states** — true pixel-perfect parity, the exact bar the plan set.
*(H5; was independent of all other phases — done last because it carried the
highest visual-regression risk in this plan.)*

- [x] Verification: `pnpm check` → 0 errors, 0 warnings across 4,291 files.
      `pnpm test` → 6 files, 52/52 passing (unaffected, as expected — no tested
      logic files touched). `pnpm build` → succeeds end-to-end, service worker
      confirmed still DOM-free.

### Phase 7 — Explicitly product-facing change (separate from the refactor) — ✅ DONE (2026-08-27)
- [x] Broaden `parseSharePayload`/`ScanImportModal` to accept full V2 backups, after M2's
      `normalizeIncomingBond` exists to share the logic. *(M4 — ship as its own change, not
      bundled into a "refactor" commit, per the UI Impact Log.)*

      → **Deviated from the plan's literal proposed resolution, for a safety reason
      found during implementation.** The plan's sketch was "give `parseSharePayload`
      a branch for `data.version === 2 && Array.isArray(data.bonds)`, mirroring
      `importJSON`'s own first branch." Implementing that literally turned out to
      be unsafe: `parseSharePayload` returns `Partial<Bond> | null` — a *single*
      bond, for the existing Add-as-New/Replace-Current preview UI — and a full
      backup has no single name/date to put there. Worse, `profileStore.importJSON()`'s
      full-backup branch **always replaces the entire local state**, ignoring
      whatever `mode` ('replace'/'add') is passed to it — unlike the single-bond
      branches, which respect it. Routing a full backup through the existing
      "Add as New Bond" button would have silently wiped every bond already on the
      device while telling the user they were *adding* one — a real Zero-Data-Loss
      violation. Kept `parseSharePayload` untouched (single-bond shapes only) and
      added a separate, explicit `detectFullBackup()` in `share.ts` that both entry
      points check *first*, before ever reaching the single-bond preview flow:
        - **Unconfigured device** (nothing to lose): imports immediately, matching
          the plan's intent — full backups now work where they used to error.
        - **Configured device**: gated behind a native `confirm()` naming the exact
          bond count and stating plainly that it replaces everything — the same
          pattern this codebase already uses for its other irreversible actions
          (`handleResetData`/`handleDeleteCurrentBond` in `SettingsSheet.svelte`),
          not a new UI convention.
      → Applied to **both** entry points that decode share payloads, not just
      `ScanImportModal` as literally named in the plan: also fixed the `#import=`
      URL hash effect in `+page.svelte`, which had the exact same latent hazard
      (its "Add as New"/"Continue in Browser" buttons also call `importJSON` with
      a `mode` the full-backup branch would ignore). Leaving one of the two entry
      points unfixed while hardening the other would have been inconsistent and
      left a real footgun in place.
      → **Two additional pre-existing bugs found and fixed while testing this**,
      both in `+page.svelte`'s hash-import effect specifically (confirmed via
      before/after Playwright runs, not just reasoned about):
        1. The effect reads `profileStore.state.isConfigured`, and every import
           path sets that to `true` on success — re-triggering the *same* effect
           while the hash might still be present (the hash is only cleared after
           the async import resolves). Without a guard, that re-entrant run
           reprocessed the same hash a second time — for the new full-backup
           branch, popping a spurious second `confirm()` for an import that had
           already completed. Fixed with a `handledImportHash` guard tracking the
           exact hash already (being) handled, so a re-entrant run for the *same*
           hash is a no-op while a genuinely new share link still gets a fresh run.
        2. A real **AGENTS.md Invariant 8 violation**: the effect can run before
           `profileStore.init()` (kicked off from the store's constructor)
           resolves. Importing before that point isn't just a stale read — it's a
           write race: `init()`'s `this.state = loaded` can land *after* an import
           that ran ahead of it, silently overwriting the just-imported data.
           Reproduced directly: an unconfigured-device full-backup hash import
           would complete, clear the URL hash, then get reverted back to the
           onboarding screen a moment later as `init()`'s stale read landed on top.
           This was reachable before Phase 7 too (the pre-existing
           standalone-auto-import branch also called `importJSON` without
           awaiting `ready`), just narrow enough not to have been caught — the
           full-backup branch's unconditional direct-import path made it easy to
           hit. Fixed by awaiting `profileStore.ready` at the top of the
           (now-extracted) `handleImportHash()` before any decision-making or
           import, for every branch, not just the new one.
      → **Verified in a real browser**, not just reasoned about: 5 Playwright
      scenarios covering both entry points × unconfigured/configured device ×
      accept/decline, plus a single-bond-invite regression check. Confirmed via
      `dialog` event interception that the `confirm()` fires with the correct
      bond-count message, that declining leaves the existing device data
      completely untouched (re-read the header after declining and confirmed it
      still showed the pre-existing bond's name), and that accepting completes
      the import. Re-ran the same suite after each of the two bug fixes above to
      confirm each one actually resolved what it claimed to (the reentrancy fix
      eliminated the spurious second dialog; the `ready` fix eliminated the
      revert-to-onboarding). Zero console/page errors across all 5 scenarios.
      → Added `detectFullBackup()` test coverage in `share.test.ts` (6 tests):
      correct bond-count detection, and `null` for single-bond-invite, V1-legacy,
      empty-bonds, missing-bonds-field, and invalid-JSON inputs.
- [x] Verification: `pnpm check` → 0 errors, 0 warnings across 4,291 files.
      `pnpm test` → 6 files, 58/58 passing. `pnpm build` → succeeds end-to-end,
      service worker confirmed still DOM-free.

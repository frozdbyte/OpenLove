# Image Sharing & Backup — Implementation Plan

Plan only — no application code changes have been made yet. Follows the same
staged, one-stage-at-a-time pattern as `REFACTOR_PLAN.md`: this doc gets
checked off and annotated with `→` notes after each stage actually ships,
and each stage is independently verifiable (`pnpm check` / `pnpm test` /
`pnpm build`, plus a manual check where noted) before moving to the next.

## Scope

Two related but independently-useful pieces of work:

1. **JSON backups (file download/upload) include photos.** No server
   involvement — photos travel as inline base64 inside the JSON file, exactly
   like every other field already in a backup.
2. **QR-code / link shares can optionally include a photo**, via a
   client-encrypted, server-relayed blob, retained for a **configurable TTL**
   (default 24h) with unlimited loads during that window — because *that*
   payload is genuinely size-constrained (URL length / QR density), unlike a
   downloaded file. Toggleable via an env var, default enabled, built on a
   small reusable feature-flag system (the same system the previously-discussed
   multi-bond toggle will reuse later).

## Key design decision: two different mechanisms, not one

It would be tempting to route *every* exported photo (file backups included)
through the same server-relay/key mechanism, so `importJSON()` only ever
handles one photo shape. **Rejected**, for a concrete reason: the relay is
TTL-bound (default 24h, configurable). A JSON backup is explicitly this
app's "keep a backup, this is the only copy" safety net
(`StorageBackupPanel.svelte`'s own copy) — if restoring a week-old backup
silently lost every photo because the relay copy had long since expired,
that's a Zero Data Loss regression, not a feature. So:

- **File backups** (`downloadBackupJSON`, "Download JSON Backup (All
  Bonds)", and their restore paths): photo embedded inline as base64,
  self-contained, works fully offline, never expires. **Not** gated by the
  `FEATURE_SHARE_IMAGES` flag — an operator disabling the *server relay* is
  worried about public upload-endpoint abuse / server storage, not about a
  user downloading their own file to their own disk, which already happens
  today with every other field.
- **QR/link/sync-code shares** (`ShareModal.svelte`): photo relayed via the
  encrypted server round-trip, gated by `FEATURE_SHARE_IMAGES`.

A second, smaller decision: even without read-once semantics, the image
should still be fetched at actual import **commit** time, not during
`parseSharePayload()`'s preview step (`PartnerInviteModal`'s
Add-as-New/Replace-Current screen) — the preview doesn't show a photo today,
so fetching+decrypting one there would just be a wasted round trip (and a
wasted decrypt) for every share the user ends up declining. This is now a
plain efficiency call, not a data-loss one — worth relaxing later if the
preview ever grows a photo thumbnail.

---

## Stage 1 — JSON backup photo embedding ✅ Done

Independent of every other stage; ships value with no new server surface.

→ Shipped as planned, plus one bug fix surfaced along the way and one
  deliberate deviation on file location:
- **New file** [`src/lib/utils/imageBase64.ts`](src/lib/utils/imageBase64.ts)
  instead of adding to the existing `utils/base64.ts`. That file's own
  doc comment scopes it to VAPID key decoding and being service-worker-safe;
  blob↔base64 conversion for backup photos is a different concern the SW
  never needs, so it got its own single-purpose module rather than growing
  an unrelated one.
- **Bug found and fixed in the same change**: `importJSON()`'s Case 2
  (`isSingleBond` invite) `mode === 'replace'` branch built its `updateBond()`
  patch as an explicit narrow field list that never included
  `photoBlob`/`photoUrl` — harmless before (there was nothing to include),
  but as soon as `normalizeIncomingBond()` could decode a real photo, this
  branch would have silently dropped it on every "Replace Current Bond"
  restore. Fixed by adding both fields to the patch. Cases 1 (full backup)
  and 3 (V1 legacy) already passed whole objects through and needed no
  change.
- `exportJSON()` was refactored (not rewritten) into a shared
  `buildExportable()` private method that `exportBackupJSON()` also calls,
  to avoid the two field lists silently drifting apart over time.
  `exportJSON()`'s output is byte-for-byte unchanged — verified by every
  pre-existing test for it still passing untouched.
- **Verified**: `pnpm check` (0 errors), `pnpm test` (65/65, 7 new — round
  trips for both the full-backup and single-bond-file shapes, a
  no-photo-field backward-compat case, and `imageBase64.ts` unit tests
  including a >32KB payload to exercise the chunked encode path),
  `pnpm build` (precache still DOM-free). Live in a real browser: onboarded
  a bond with a photo, downloaded both "Download JSON Backup (All Bonds)"
  and `ShareModal`'s "Download Bond JSON File", confirmed both contain an
  inline `photo.dataBase64`/`mimeType`, then restored the full backup and
  confirmed the photo blob round-tripped into IndexedDB byte-for-byte
  (68/68 bytes, correct mime type) with zero console errors.

- `src/lib/utils/base64.ts` (existing, DOM-free): add
  `blobToBase64(blob): Promise<string>` / `base64ToBlob(base64, mimeType): Blob`.
  No encryption — this data never leaves the device except by the user's own
  explicit download/upload action, same trust level as the rest of the file.
- `src/lib/stores/profile.svelte.ts`: new **async** `exportBackupJSON(activeOnly: boolean): Promise<string>`,
  separate from the existing synchronous `exportJSON()` (which stays exactly
  as-is and keeps serving the compact QR/link/sync-code paths — those must
  stay small and synchronous). `exportBackupJSON` embeds
  `photo: { dataBase64, mimeType }` per bond when `photoBlob` exists.
- `importJSON()`: extend bond normalization (`normalizeIncomingBond` /
  a new `resolveIncomingPhoto(raw)` helper) to decode an inline
  `raw.photo.dataBase64` back into a `Blob` and persist it through the
  existing photo-save path (`saveBondPhoto`/`setPhoto`'s underlying
  mechanism). Must tolerate the field being absent (legacy backups, and
  bonds that never had a photo).
- `ShareModal.svelte`'s `downloadBackupJSON()`: `await profileStore.exportBackupJSON(true)`.
- `StorageBackupPanel.svelte`'s "Download JSON Backup (All Bonds)": `await profileStore.exportBackupJSON(false)`.
- "Restore from JSON Backup" needs no change beyond `importJSON()` already
  handling the new field.

**Tests:** extend `share.test.ts`/`profile.test.ts` with an export→import
round trip that carries a photo, and confirm a backup *without* the field
(current shape) still imports cleanly.

**Manual verification:** create a bond with a photo → download full backup →
reset app → restore from that file → photo reappears.

---

## Stage 2 — Shared feature-flag infrastructure ✅ Done

Reusable for `FEATURE_SHARE_IMAGES` now and `FEATURE_MULTI_BOND` later.
Necessary because the root route is prerendered with `ssr = false`
(Invariant 7) — `$env/static/public` and server `load` functions both
resolve at *build* time, which can't reflect a Docker `docker-compose.yml`
env var set at *container start*. The existing `PUBLIC_VAPID_KEY` /
`/api/push/vapid-public-key` pattern already solves this correctly; this
stage generalizes it.

- `src/lib/types/featureFlags.ts` (new): shared `FeatureFlags` interface,
  e.g. `{ shareImages: boolean }` (extended later with `multiBond`).
- `src/lib/server/featureFlags.ts` (new): a small registry —
  `{ shareImages: { env: 'FEATURE_SHARE_IMAGES', default: true } }` — and
  `getFeatureFlags(): FeatureFlags`, parsing `process.env` the same
  defensive way `getVapidSubject()` already does (`"false"`/`"0"` → off,
  unset/anything else → default).
- `src/routes/api/share/config/+server.ts` (new): `GET`, `prerender = false`,
  returns `getFeatureFlags()` as JSON. Mirrors `vapid-public-key/+server.ts`.
- `src/lib/stores/featureFlags.svelte.ts` (new): fetches the endpoint once
  (called from `profileStore.init()`), caches the result via the existing
  `setSyncMeta()` (`outbox.ts`) so it survives offline, exposes `$state`
  reactive booleans defaulting to each flag's compiled-in default until the
  first successful fetch.
- `.env.example`: document `FEATURE_SHARE_IMAGES=true` (commented, default
  shown), with a one-line note reserving `FEATURE_MULTI_BOND` for later.
  Also document `SHARED_IMAGE_TTL_HOURS=24` here (default shown, commented)
  — grouped with the other share-image config even though it's read
  directly by `sharedImage.ts` in Stage 3, not by `featureFlags.ts`, since
  from a self-hoster's point of view it's the same feature's config.

**Tests:** unit test `getFeatureFlags()`'s parsing table (true/false/"0"/unset/garbage).

**Manual verification:** hit `/api/share/config` in dev with the var unset
(expect `true`) and set to `false` (expect `false`, no rebuild needed).

→ Shipped as planned, with two deviations and one real bug caught by
  actually running it rather than just type-checking:
- **`featureFlags.svelte.ts` init trigger**: the plan said "called from
  `profileStore.init()`". Built it instead as an explicit `init()` method
  called from `+layout.svelte`'s `onMount` — the same convention
  `pwaStore`/`networkStore` already use, and more consistent than
  `profileStore`'s self-initializing constructor (which is special-cased
  because routing decisions depend on it before the layout even mounts; no
  such urgency for feature flags). Also fixes a real problem the "self-init
  on import" version would have had: with nothing importing the module yet
  (Stage 5 is the first real consumer), its constructor would never run at
  all in the shipped bundle — confirmed by writing a Playwright check
  against it before wiring in the layout import, which found exactly this.
- **Cache mechanism**: used a dedicated `openlove_feature_flags_v1` key via
  plain `idb-keyval` `get`/`set` (same default store `db.ts` already uses),
  not `outbox.ts`'s `setSyncMeta()`. `SyncMeta`'s own doc comment scopes it
  to "everything the service worker needs to rebuild a subscription" —
  feature flags are unrelated to that and the service worker never needs
  them, so folding them in would have stretched that type's purpose rather
  than reused it.
- **Bug found via the Playwright check, not `pnpm check`**: the first
  working version threw `DataCloneError: ... could not be cloned` on every
  `set(CACHE_KEY, this.flags)` call, silently swallowed by the `catch {}`
  around it (visible only by removing the catch temporarily and re-running).
  Root cause: AGENTS.md Invariant 3 — `this.flags` is a Svelte 5 `$state`
  Proxy, and IndexedDB's structured clone can't serialize a Proxy directly.
  Fixed with the same `JSON.parse(JSON.stringify(...))` unwrap `db.ts`
  already uses everywhere else. A good reminder that this invariant applies
  to *any* new store that persists `$state` to IndexedDB, not just the
  original two files it was written against.
- **Verified**: `pnpm check` (0 errors), `pnpm test` (79/79, +14 new for
  `getFeatureFlags()`'s parse table), `pnpm build` (precache still
  DOM-free). Live in a real browser: restarted the dev server with
  `FEATURE_SHARE_IMAGES` unset (endpoint returns `true`) and then `=false`
  (endpoint returns `false`, no rebuild) — confirmed the *client* correctly
  fetches and caches each value in IndexedDB, and confirmed the cached
  value survives and the app still boots cleanly when the config endpoint
  is unreachable (simulating offline).

---

## Stage 3 — Server: encrypted image relay storage ✅ Done

Gated by the Stage 2 flag end-to-end (both endpoints 404 when disabled).

- `prisma/schema.prisma`: add
  ```
  model SharedImage {
    id         String   @id @default(uuid())
    ciphertext Bytes
    createdAt  DateTime @default(now())
  }
  ```
  additive only, no change to existing models. Apply via this project's
  existing `pnpm prisma:push` convention (no other model has needed a
  migration file yet).
- `src/lib/server/sharedImage.ts` (new): size-cap constant (e.g. 8MB
  post-encryption); a `getSharedImageTtlMs()` helper reading
  `SHARED_IMAGE_TTL_HOURS` from `process.env` the same defensive way
  `getVapidSubject()` parses its own vars (invalid/unset/≤0 → default 24h,
  one console warning on a bad value, not a crash);
  `saveSharedImage(ciphertext): Promise<{id}>`;
  `getSharedImage(id): Promise<Buffer|null>` — looks the row up and returns
  it if not past its TTL, **does not delete on read** (unlimited loads within
  the window — deletion is TTL-sweep-only, never a side effect of a GET);
  `cleanupExpiredSharedImages(): Promise<{deleted:number}>`, using the
  *current* `getSharedImageTtlMs()` value so a TTL changed at container
  restart applies to the next sweep without needing a data migration.
- `src/routes/api/share/image/+server.ts` (new): `POST`, `prerender = false`.
  404s when the flag is off; 413-equivalent JSON error over the size cap;
  otherwise stores and returns `{ shareId }`.
- `src/routes/api/share/image/[id]/+server.ts` (new): `GET`, `prerender = false`.
  404s when the flag is off or the id doesn't exist/has expired; otherwise
  returns the ciphertext bytes. Repeatable — does not mutate/delete state.
- `hooks.server.ts`: start/stop a `cleanupExpiredSharedImages()` interval
  using the exact `setInterval` + `unref()` + shutdown-hook pattern
  `startMilestoneScheduler()`/`stopMilestoneScheduler()` already establish —
  new `startSharedImageCleanup()`/`stopSharedImageCleanup()` pair, same file
  layout as `scheduler.ts`. Sweep interval itself can stay a fixed cadence
  (e.g. hourly) independent of the configurable TTL value it's enforcing.

**Tests:** mirror `scheduler.test.ts`'s `vi.hoisted` + in-memory-fake-Prisma
pattern for `cleanupExpiredSharedImages()` (including a case with a
non-default `SHARED_IMAGE_TTL_HOURS`); endpoint tests for the flag-off-404,
size-cap-rejected, and expired-id-404 cases; a test that two GETs against
the same unexpired id both succeed.

**Manual verification:** `curl` round trip — POST bytes, GET twice (both
succeed, same bytes), set `SHARED_IMAGE_TTL_HOURS=0` and confirm a
subsequent sweep/GET treats it as already expired.

→ Shipped as planned, with three deviations:
- **`@@index([createdAt])`** added to the `SharedImage` model — not in the
  plan's original schema snippet, but the cleanup sweep's `WHERE createdAt <
  cutoff` query benefits from it and every other model in this schema
  indexes its own hot lookup column already.
- **`Uint8Array.from(ciphertext)`** in `saveSharedImage()`: Prisma's
  generated `create()` input wants a `Uint8Array<ArrayBuffer>` specifically;
  Node's `Buffer` is typed against `ArrayBufferLike` (which also covers
  `SharedArrayBuffer`), so passing a `Buffer` straight through failed
  `pnpm check`. `.from()` allocates a fresh, non-shared buffer, which
  satisfies the stricter type.
- **The `SHARED_IMAGE_TTL_HOURS=0` manual-verification step, as literally
  written, contradicts what got built** — and what got built is correct.
  `getSharedImageTtlMs()` treats `0` (and negative/non-numeric values) as
  *invalid input*, warns once, and falls back to the 24h default — the same
  defensive philosophy `getVapidSubject()` already uses elsewhere in this
  codebase, so a self-hoster's typo can't silently make every future share's
  photo permanently unfetchable with no visible error. That means `=0`
  does **not** expire anything immediately; verified live (see below) that
  it instead logs the fallback warning and the image stays retrievable.
  Real expiry was demonstrated instead with a tiny *valid* positive TTL
  (`SHARED_IMAGE_TTL_HOURS=0.001`, ~3.6s).
- **Verified**: `pnpm check` (0 errors), `pnpm test` (89/89, +10 new —
  TTL parsing table, save/get round trip, unlimited-reads-within-TTL,
  live TTL-expiry-before-any-sweep, and cleanup honoring a TTL changed after
  the row was saved), `pnpm build` (Prisma client regenerated cleanly,
  precache still DOM-free). Live via `curl` against the dev server: full
  POST→GET→GET round trip (same bytes both times); both endpoints 404 with
  `FEATURE_SHARE_IMAGES=false`; a ~9MB payload rejected with `413` under the
  8MB cap; `SHARED_IMAGE_TTL_HOURS=0.001` (~3.6s) demonstrated a real image
  going from retrievable to `404` purely from the read-time TTL check, with
  no sweep having run yet; `SHARED_IMAGE_TTL_HOURS=0` confirmed to log the
  fallback warning and leave the image retrievable, per the corrected
  behavior above.

---

## Stage 4 — Client crypto + relay helpers ✅ Done

- `src/lib/utils/imageCrypto.ts` (new): `encryptBlob(blob): Promise<{ciphertext: ArrayBuffer, key: string, iv: string}>`
  and `decryptToBlob(ciphertext, key, iv, mimeType): Promise<Blob>`, built on
  `crypto.subtle` (AES-GCM, 256-bit) — no new dependency, consistent with
  this codebase's existing preference for native/hand-rolled over a library
  (same instinct that avoided `workbox-background-sync`). Pure functions,
  no DOM dependency beyond `crypto`/`Blob`/`ArrayBuffer`, which are
  available in Vitest's Node environment too.
- `src/lib/utils/shareImage.ts` (new): `uploadSharedImage(blob): Promise<{shareId,key,iv}|null>`
  (checks the feature-flag store first, fails soft — returns `null` rather
  than throwing — on any network/flag-off condition) and
  `fetchSharedImage(shareId, key, iv, mimeType): Promise<Blob|null>` (same
  fail-soft contract).

**Tests:** encrypt→decrypt round-trip unit test (this is the one place worth
testing crypto correctness in isolation, before it's wired into any UI).

→ Shipped as planned, with the wire shape tightened and one type-strictness
  fix repeating a pattern from Stage 3:
- **`EncryptedBlob.ciphertext` is base64 (`string`), not `ArrayBuffer`** —
  a deviation from the plan's literal `Promise<{ciphertext: ArrayBuffer, ...}>`
  signature. `key`/`iv` were always going to be base64 (they travel in a
  JSON share payload), and the relay's wire format (Stage 3) is JSON
  `{ciphertext: base64}` either direction — keeping `encryptBlob()`'s output
  all-base64 means `shareImage.ts` needs zero extra conversion at either
  call site, and `decryptToBlob()`'s three string params are uniform instead
  of mixing a raw buffer with two base64 strings.
- **`imageBase64.ts` refactored, not duplicated**: pulled the byte-level
  `bytesToBase64`/`base64ToBytes` out of `blobToBase64`/`base64ToBlob`
  (Stage 1) so `imageCrypto.ts` reuses the same chunked-encode logic for
  raw key/iv/ciphertext bytes instead of a second copy. `blobToBase64`/
  `base64ToBlob`'s public behavior is unchanged — their existing Stage 1
  tests still pass untouched.
- **Same `ArrayBufferLike` vs `ArrayBuffer` type friction as Stage 3**
  (`Uint8Array.from()` there): `base64ToBytes()`'s inferred return type
  didn't satisfy `Blob`'s constructor or `crypto.subtle`'s `BufferSource`
  params. Fixed with an explicit `Uint8Array<ArrayBuffer>` return
  annotation rather than reaching for `.from()` again, to avoid an extra
  copy on every decode.
- **Verified**: `pnpm check` (0 errors), `pnpm test` (106/106, +17 new —
  crypto round trip including a wrong-key/wrong-iv rejection check and a
  >32KB payload, `bytesToBase64`/`base64ToBytes` direct coverage, and
  `shareImage.ts`'s fail-soft contract for every failure mode: flag off,
  network error, non-ok response, malformed body, and a failed decrypt —
  plus a fully mocked upload→fetch pipeline test), `pnpm build`. Then,
  since Stage 4 is the first point real `crypto.subtle` and the real Stage
  3 server can be exercised together: loaded the running dev server in an
  actual browser and dynamically imported `shareImage.ts` directly (nothing
  in the UI calls it yet — Stage 5 wires that in) to run
  `uploadSharedImage`→`fetchSharedImage` against the live endpoints with
  real encryption. Confirmed byte-exact round trip, a second fetch of the
  same id also succeeding (unlimited loads), and a bogus id failing soft to
  `null` rather than throwing.

---

## Stage 5 — QR/link share: image toggle + relay wiring

The originally-requested feature, now sitting on top of Stages 2–4.

- `ShareModal.svelte`: new toggle, rendered only when
  `featureFlags.shareImages && profileStore.activeBond.photoBlob`. Upload is
  **lazy** — only on first actual "generate/copy" action with the toggle on,
  not eagerly when the modal opens or the toggle is flipped, so an abandoned
  share doesn't leave orphaned ciphertext waiting on the 24h TTL. The
  resulting `{shareId,key,iv}` is cached locally for the lifetime of the
  modal so switching between "Copy Link" / QR / "Copy Sync Code" doesn't
  re-upload three times.
- `exportJSON()` (the existing *compact/synchronous* export used for
  QR/link/sync-code — untouched by Stage 1): gains an optional
  `sharedImage?: {shareId, key, iv}` field on the single-bond payload when
  a share was generated with the toggle on.
- `parseSharePayload()`: recognizes `sharedImage` for shape-detection
  purposes only — **does not fetch it**. See the preview-efficiency
  rationale above (no longer a data-loss concern now that GETs don't
  consume the image, just an avoided wasted round trip for declined shares).
- Actual import-commit paths — `+page.svelte`'s `completeHashImport`,
  `ScanImportModal.svelte`'s `handleImportData`, and `PartnerInviteModal`'s
  `handleAcceptInvite` (via `importJSON`) — after a bond is
  created/replaced, if `sharedImage` is present: `fetchSharedImage()` +
  `setPhoto()`. Fail-soft: a failed/expired fetch logs and leaves the bond
  photo-less rather than blocking the import.

**Tests:** payload-shape detection unit tests (crypto itself already covered
in Stage 4).

**Manual verification:** two browser contexts — generate a share with the
photo toggle on in one, import via the link in the other, confirm the photo
arrives; import the *same* link again (either context) and confirm the
photo arrives again too (unlimited loads within the TTL); manually expire
the row (or set a very short `SHARED_IMAGE_TTL_HOURS`) and confirm a later
import still succeeds, just without a photo (fail-soft).

---

## Stage 6 — Docs & hardening

- `AGENTS.md`: new **Invariant 11** documenting `SharedImage` — what it
  stores (opaque ciphertext only, server never holds the key), why that's
  still consistent with the Zero-Knowledge Privacy invariant, and its
  TTL-bound (default 24h, `SHARED_IMAGE_TTL_HOURS`-configurable), unlimited-reads-within-window
  lifetime. Update the Repository Directory Map and Key Subsystems
  Breakdown for the new `server/sharedImage.ts`, `server/featureFlags.ts`,
  `stores/featureFlags.svelte.ts`, `utils/imageCrypto.ts`,
  `utils/shareImage.ts`, and the two new API routes. Update `.env.example`
  documentation.
- `share-import-safety` skill (existing): extend with the new photo-arrival
  shapes (inline base64 vs. relay shareId+key) and a note on the relay's
  TTL-only (not read-count) expiry model, so a future agent doesn't assume
  either "unlimited forever" or "one-shot" without checking.
- Full `pnpm check` / `pnpm test` / `pnpm build` pass; a final manual PWA
  offline check (Stage 1's file-backup restore should work fully offline;
  Stage 5's relay fetch should fail soft, not crash, when offline).

---

## Open items for confirmation before implementation starts

- Size cap for the relay upload (proposed: 8MB post-encryption — roughly a
  compressed phone photo; large enough to not be annoying, small enough to
  bound abuse without new infra).
- No per-IP rate limiting on the upload endpoint in this plan (this app has
  none anywhere today); size cap + TTL bounds the blast radius for a
  self-hosted single-instance app. Flagged as an intentional scope cut, not
  an oversight — worth revisiting given reads are now unlimited within the
  TTL window (a leaked link now stays fetchable by anyone for the full TTL,
  not just once), though the actual secret is still the shareId+key pair,
  same as every other field in a leaked share payload already unlimited for
  as long as it's held.
- `SHARED_IMAGE_TTL_HOURS` default: proposed 24h, matching the original
  spec. Open to a different default; the config plumbing (Stage 2/3) doesn't
  care what the number is.
- Endpoint path naming (`/api/share/image`, `/api/share/config`) — matches
  the existing `/api/push/*` grouping convention; open to renaming.

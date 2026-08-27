# AGENTS.md — Developer & AI Agent Guide for OpenLove ❤️

Welcome! This document is the **single source of truth** for human contributors and AI agents working on **OpenLove**. It outlines the core philosophy, technical architecture, recent changes, directory layout, and strict invariants you must follow.

---

## 🎯 Project Overview & Core Philosophy

**OpenLove** is a free, self-hosted, privacy-first relationship tracker and anniversary reminder alternative to "My Love".

### Core Values
1. **Zero-Knowledge Privacy**: Couple names, anniversary start dates, high-resolution photo blobs, and personal notes are stored **strictly on the user's client device in IndexedDB**.
2. **Anonymous Minimalist Backend**: The server SQLite database stores **only** anonymous Web Push tokens, together-since dates (for milestone computation), and subscriber timezones — plus, only when a user opts in to sharing a photo via QR/link, opaque client-encrypted ciphertext the server has no key to read, auto-deleted after a short TTL (see Invariant 11).
3. **Aesthetic & Delightful UX**: Dual UI themes (**Modern** glassmorphic and nostalgic **Traditional** replica of classic "My Love"), dark mode, custom color accents, and full PWA installation support.
4. **Frictionless Self-Hosting**: 1-command Docker/Podman deployment (`docker compose up -d`), genuine offline-first PWA (precached shell, self-hosted fonts, offline mutations), and Coolify/Homelab ready.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Key Details |
| :--- | :--- | :--- |
| **Frontend Framework** | **SvelteKit 2** + **Svelte 5** | Uses modern **Svelte 5 Runes** (`$state`, `$derived`, `$effect`, `$props`, `$bindable`). |
| **Styling** | **Tailwind CSS v4** | CSS variables defined in `@theme` block in [`src/app.css`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/app.css). |
| **Icons** | **Lucide Svelte** (`@lucide/svelte`) | Modern vector icon set. |
| **Client Storage** | **IndexedDB** via `idb-keyval` | Stores profile metadata, custom milestones, and high-res couple photo `Blob`s. |
| **Server Database** | **SQLite** via **Prisma ORM v7** | Driver adapter `@prisma/adapter-better-sqlite3` + `better-sqlite3`. |
| **Web Push** | `web-push` + RFC 8292 VAPID | Auto-generated VAPID keys (`data/vapid.json`) + Apple APNs compliant subjects. |
| **Scheduler** | Node Background Cron | Hourly timezone-aware milestone checker initialized in [`src/hooks.server.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/hooks.server.ts). |
| **PWA & Offline** | `@vite-pwa/sveltekit` (`injectManifest`) + Workbox 7 | **One** service worker doing precaching, navigation fallback, push and sync. Prerendered SPA shell. See Invariant 7. |
| **Offline Sync** | Hand-rolled IndexedDB outbox | One-directional client→server queue with coalescing, backoff and last-write-wins. See Invariant 8. |
| **Sharing & Sync** | URL Hash + QR Code | `#import=<base64-json>` + QR camera scanner (`jsqr`) & QR generator (`qrcode`). Single-source decode/detect logic lives in [`src/lib/utils/share.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/share.ts) — see Invariant 9. |
| **Photo Sharing** | Client-side AES-GCM + server relay | Opt-in per share (`ShareModal.svelte`'s toggle). `crypto.subtle` encrypts on-device; the server stores only ciphertext, TTL-swept. See Invariant 11. |
| **Feature Flags** | Runtime env vars via a config endpoint | `GET /api/share/config`, not `$env/static/public` — see Invariant 12 for why. |
| **Containerization** | Multi-Arch Docker/Podman | Multi-stage build with `--platform=$BUILDPLATFORM` for native host compilation. |
| **Testing** | Vitest | Pure-function unit tests only (no DOM) — date/milestone math, outbox coalescing, server sync conflict resolution, share-payload parsing, image crypto round trips. Run via `pnpm test`. See "Testing" under Common Commands. |

---

## 🚨 Strict Invariants & Agent Rules (Must Follow)

### 1. Privacy Invariant (CRITICAL)
- **NEVER** create database columns, server endpoints, or logs that accept couple names, messages, or **plaintext** photo files.
- The `PushSubscription`/`SubscriptionBond` tables must strictly hold:
  `{ id, endpoint, p256dh, auth, togetherSince, timezone, lastNotified, clientUpdatedAt, createdAt, updatedAt }`.
- `clientUpdatedAt` is an ISO-8601 timestamp on the **client** clock, added in v1.4.0 for
  last-write-wins sync (see Invariant 7). It is a timestamp, not personal data — the privacy
  invariant is intact — but this allowlist must be kept accurate.
- One deliberate, narrow exception: the `SharedImage` table stores **opaque AES-GCM
  ciphertext** for the opt-in photo-sharing relay — the server never holds a decryption key
  or plaintext, and rows are TTL-swept. This does not weaken the invariant above; it has its
  own rules — see Invariant 11 before touching it.

### 2. Svelte 5 Runes Standard
- **Always** use Svelte 5 runes: `$state()`, `$derived()`, `$effect()`, `$props()`, `$bindable()`.
- **Do NOT** use Svelte 4 legacy `writable()` stores or `let:prop` slot syntax.

### 3. IndexedDB Proxy Unwrapping Rule
- Svelte 5 wraps `$state` objects in JavaScript reactive `Proxy` instances.
- **Always unwrap proxies** before saving to IndexedDB using `JSON.parse(JSON.stringify(data))` in [`src/lib/storage/db.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/storage/db.ts). Passing raw Proxies to `idb-keyval` will throw `DOMException: Proxy object could not be cloned`.

### 4. Prisma ORM v7 Standards
- Prisma v7 no longer uses legacy Rust query engine binaries.
- Use `provider = "prisma-client"` with `output = "../src/lib/generated/prisma"` in [`prisma/schema.prisma`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/prisma/schema.prisma).
- Datasource URLs must be defined in [`prisma.config.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/prisma.config.ts) (with fallback `process.env.DATABASE_URL || 'file:./data/openlove.db'`).
- Always instantiate `PrismaClient` with `PrismaBetterSqlite3` driver adapter in [`src/lib/server/db.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/db.ts).

### 5. Multi-Arch Docker Build Rule
- In [`Dockerfile`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/Dockerfile):
  - **Stage 1 (Builder)** must use `FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS builder` so SvelteKit/Vite compilation runs natively on the host CPU.
  - **Stage 2 (Runner)** must contain **zero `RUN` commands** (only `COPY`, `ENV`, `VOLUME`, `EXPOSE`, and `ENTRYPOINT ["sh", "./entrypoint.sh"]`) to guarantee 100% reliable cross-architecture assembly (`linux/amd64` and `linux/arm64`) without QEMU crashes.

### 6. Apple APNs & RFC 8292 VAPID Subject Rule
- WebPush providers (especially Apple `web.push.apple.com` for iOS PWAs) reject `.local`, `localhost`, or invalid domains with `403 {"reason":"BadJwtToken"}`.
- **Validate the host, not just the scheme.** `getVapidSubject()` checks both: a value like
  `mailto:admin@openlove.local` passes any scheme-only check and then fails at Apple with an
  error that reads like a signing problem, sending you hunting in the wrong place. Non-public
  hosts (`.local`, `.lan`, `.internal`, `localhost`, bare hostnames, IP literals) fall back to
  a public URL with a console warning. The same guard applies to the `ORIGIN` fallback chain,
  because `ORIGIN` is very often `http://localhost:3000` in a self-hosted setup.
- `VAPID_SUBJECT` is a **contact address, not the app URL**. Never ship a non-public default in
  `.env.example` — it silently breaks push for every self-hoster who copies it.
- [`src/lib/server/push.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/push.ts) includes `getVapidSubject()` to resolve valid `mailto:` or `https://` URLs from Coolify (`SERVICE_FQDN_OPENLOVE_3000`), `ORIGIN`, or public fallback.

### 7. Single Service Worker Rule (CRITICAL)
Only one service worker can control scope `/`. Before v1.4.0 two were emitted — SvelteKit's
`/service-worker.js` (push, no caching) and Workbox's `/sw.js` (caching, no push) — so the app
had offline caching **XOR** push notifications, never both. Worse, `/sw.js` threw at evaluation
time because `createHandlerBoundToURL('/')` had no `/` in its precache manifest, and a silent
`.catch()` in `pwa.svelte.ts` hid it. **Nothing was ever cached.**

The invariant that prevents this recurring:

- **One source, one URL.** [`src/service-worker.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/service-worker.ts)
  is the only service worker. SvelteKit compiles it; `@vite-pwa/sveltekit` (`strategies: 'injectManifest'`,
  `filename: 'service-worker.ts'`) injects the Workbox manifest into it and emits `/service-worker.js`.
  Keeping the URL stable is what lets existing installs migrate in place.
- **One registration.** `kit.serviceWorker.register = false` (`svelte.config.js`) plus
  `injectRegister: false` (`vite.config.ts`) disable both auto-registrations. The single
  registration lives in [`PWAToast.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/pwa/PWAToast.svelte)
  via `virtual:pwa-register`. **Never add a second `navigator.serviceWorker.register()` call,
  and never swallow a registration error.**
- **`/` must stay precached.** The root route is prerendered
  ([`src/routes/+layout.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/routes/+layout.ts):
  `prerender = true`, `ssr = false`), which puts `prerendered/pages/index.html` in Workbox's glob
  directory (`.svelte-kit/output`, *not* `build/`), where the plugin's manifest transform rewrites
  it to `/` with a content-hash revision. `pnpm build` asserts this via
  [`scripts/verify-precache.js`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/scripts/verify-precache.js)
  — if that check fails, the build is not offline-capable. Do not ship it.
- Any new `+server.ts` under `src/routes/api/` **must** declare `export const prerender = false;`,
  because the root layout's `prerender = true` cascades to endpoints.
- The service worker may only import DOM-free modules. `$lib/sync/core.ts`,
  `$lib/storage/outbox.ts` and `$lib/utils/base64.ts` are safe; `$lib/sync/index.ts` and
  `$lib/push/client.ts` are **not** (they import `profileStore`, which touches `document`).

> **Debugging note:** an error thrown anywhere in the SSR build surfaces as
> `[vite-plugin-pwa:sveltekit:build] The 'swSrc' file can't be read` — the plugin's `closeBundle`
> runs in a `finally` and masks the real failure. When you see that, the actual error is
> upstream. One real cause: `virtual:pwa-register` dynamically imports `workbox-window`, which
> pnpm's strict layout only resolves if it is a **direct** devDependency (as are the six
> `workbox-*` packages the service worker itself imports).

### 8. One-Directional Sync Rule
Client → server only. The client owns `togetherSince`, `timezone` and the push keys; the server
owns exactly one field the client never reads (`lastNotified`). There is no pull phase, no merge
and no conflict resolution — just an at-least-once outbox against idempotent, last-write-wins
handlers. Keep it that way; a pull phase would reintroduce every problem this design avoids.

- **Every mutation goes through `profileStore.update()`.** The `onProfileMutation` hook registered
  in [`src/lib/sync/index.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/sync/index.ts)
  is what keeps the server in step. Before v1.4.0, `togetherSince` was sent to the server exactly
  once at subscribe time while three call sites mutated it afterwards, so changing your
  anniversary date left the server firing milestone pushes on the old schedule forever.
- **Never sync before `await profileStore.ready`.** Until IndexedDB has been read, `profile` holds
  `DEFAULT_PROFILE` — whose `togetherSince` is *today*. Syncing that overwrites the real date.
  This applies to **mount-time `$effect`s just as much as imperative code** — a top-level effect
  in `+page.svelte` can run, and even finish an async write, *before* `profileStore.init()`
  (kicked off from the store's own constructor) resolves. When `init()`'s `this.state = loaded`
  lands afterward, it silently reverts whatever the early write just did. This is not
  hypothetical: the `#import=` hash-import effect shipped with exactly this race — a full-backup
  import would complete, clear the URL, then the page would revert back to onboarding a moment
  later. Any mount-time effect that reads `profileStore.state` for a real decision, or calls a
  mutating method, must `await profileStore.ready` first. See the `share-import-safety` skill
  and `handleImportHash()` in `+page.svelte` for the fixed reference pattern.
- **Background Sync is a progressive enhancement, never the mechanism.** Neither Safari nor
  Firefox supports it. The baseline is four foreground triggers: app start, `online`,
  `visibilitychange`, and an opportunistic flush on `push`.
- **Do not use `workbox-background-sync`.** Its queue lives in an opaque IndexedDB store the
  window cannot inspect, which makes both the coalescing rules and the pending-changes UI
  impossible.
- **`navigator.onLine` is a hint only** — it reports `true` behind captive portals. It may drive
  presentation, never a decision to skip a flush.

### 9. Full-Backup Import Safety (CRITICAL)
- [`profileStore.importJSON(json, mode)`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/stores/profile.svelte.ts)
  has three branches. The single-bond branches (V2 single-bond invite, V1 legacy) respect
  `mode: 'replace' | 'add'`. **The full-backup branch (`data.version === 2 && Array.isArray(data.bonds)`)
  does not** — it always replaces the entire local app state regardless of `mode`.
- **Never** route a payload of unverified shape through the single-bond Add-as-New/Replace-Current
  UI without checking [`detectFullBackup()`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/share.ts)
  first. A full backup routed through that UI silently wipes every bond already on the device
  while the button claims to be additive — a real, user-facing Zero-Data-Loss violation, not a
  theoretical one; it was one commit away from shipping in `ScanImportModal.svelte`.
- The fixed reference pattern lives in `ScanImportModal.svelte`'s `handleImportData` and
  `+page.svelte`'s `handleImportHash`: an unconfigured device (nothing to lose) imports a full
  backup directly; a configured device requires an explicit native `confirm()` naming the exact
  bond count — the same pattern this codebase already uses for its other irreversible actions
  (`handleResetData`/`handleDeleteCurrentBond` in `SettingsSheet.svelte`), not a new UI convention.
- See the `share-import-safety` skill before touching any of this code.

### 10. Local-Calendar-Day Comparisons (Timezone Safety)
- [`calculateMilestones()`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/time.ts)
  builds every `targetDate` with `new Date(year, month, day)` — a **local-timezone** constructor.
  `date.toISOString()` always renders in **UTC**. Comparing one against the other to answer "is
  this the same calendar day" introduces a bug that depends on the *server process's* timezone
  offset — independent of any subscriber's own timezone setting.
- This shipped: the milestone scheduler compared `m.targetDate.toISOString().split('T')[0]`
  against the subscriber's local calendar date string, silently firing push notifications a day
  early, a day late, or not at all whenever the container's `TZ` wasn't UTC. It stayed invisible
  because the common Docker default happens to be UTC, where the bug is a no-op.
- **The rule:** compare `getFullYear()`/`getMonth()`/`getDate()` directly when the intent is
  "same calendar day" — never `.toISOString().split('T')[0]`. See
  [`toLocalDateString()`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/scheduler.ts)
  for the fixed reference pattern, and the `share-import-safety` skill.

### 11. Encrypted Photo Relay (SharedImage)
A photo shared via QR/link (`ShareModal.svelte`'s "Share Photo" toggle) is genuinely too big
to embed in a URL or QR code, unlike every other field in that payload. It's relayed through
the server instead — client-encrypted, so this stays consistent with Invariant 1 rather than
carving a hole in it.

- **The server never holds a decryption key.** [`src/lib/utils/imageCrypto.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/imageCrypto.ts)
  encrypts the photo with a freshly generated, single-use AES-GCM key entirely client-side.
  [`src/lib/utils/shareImage.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/shareImage.ts)'s
  `uploadSharedImage()` POSTs only the ciphertext to `POST /api/share/image`; the key and IV
  travel exclusively inside the share payload itself (the same QR/link everything else in
  that payload already travels through), never to the server. **Never** add an endpoint or
  log line that could receive the key alongside the ciphertext — that would silently turn an
  encrypted relay into a plaintext one.
- **Unlimited reads within a TTL, not read-once.** [`src/lib/server/sharedImage.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/sharedImage.ts)'s
  `getSharedImage()` never deletes on a successful `GET` — a deliberate choice over the more
  "obviously secure"-looking read-once design: the real secret is the unguessable
  `shareId`+`key` pair (same trust level as every other field in the same share payload,
  which has no expiry at all), and read-once breaks on the first flaky network blip or lets
  the same QR code only be scanned by one recipient. Deletion is exclusively
  `cleanupExpiredSharedImages()`'s job, on a TTL controlled by `SHARED_IMAGE_TTL_HOURS`
  (default 24h). `getSharedImage()` also checks the TTL itself at read time — the cleanup
  sweep runs hourly, so without that check a row could still serve a technically-expired
  image for up to an hour.
- **`SHARED_IMAGE_TTL_HOURS=0` does not mean "expire immediately."** `getSharedImageTtlMs()`
  treats zero, negative, and non-numeric values as *invalid input* and falls back to the 24h
  default with a logged warning — the same defensive philosophy `getVapidSubject()` already
  uses. Don't "fix" this to treat `0` as a real zero-hour TTL; that would silently break the
  feature for anyone who mistypes the var.
- **Fetching a relay photo must never happen during an invite *preview*.** The relay's
  `{shareId,key,iv,mimeType}` reference (`sharedImage` on the wire — see the
  `share-import-safety` skill for how this differs from the *inline* base64 `photo` field
  JSON file backups use) is only ever resolved inside `profileStore.importJSON()`'s Case 2,
  at actual import-commit time — never from `parseSharePayload()`, which builds the
  Add-as-New/Replace-Current preview UI. Even though reads are unlimited now (not
  read-once), fetching there would still be a wasted round trip for every share a user ends
  up declining.
- **A relay-photo fetch must never fail the whole import.** `fetchSharedImage()` already
  fails soft (`null`, never throws) on any problem — expired, offline, corrupt key. The
  attachment code in `importJSON()` wraps it in its *own* try/catch anyway, because
  `setPhoto()` touches IndexedDB and `importJSON()`'s outer catch would otherwise report an
  already-successfully-imported bond as a failed import over a photo that just didn't load.

### 12. Runtime-Configurable Feature Flags
The root route is prerendered with `ssr = false` (Invariant 7) — the whole shell is a static
SPA build baked at `pnpm build` time, which runs *inside the Docker image build*, before a
self-hoster's `docker-compose.yml` env vars exist. That rules out both `$env/static/public`
and a `+layout.server.ts` load function for anything that must reflect an env var set at
*container start* — both would only ever see the build-time value.

- **The pattern**: resolve the flag from `process.env` server-side (`getFeatureFlags()` in
  [`src/lib/server/featureFlags.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/featureFlags.ts),
  fresh on every call, no caching), serve it through a small `GET` endpoint
  (`/api/share/config`, `prerender = false`), and have the client fetch-and-cache it
  (`src/lib/stores/featureFlags.svelte.ts`) the same way `PUBLIC_VAPID_KEY` already flows
  through `/api/push/vapid-public-key`. **Adding a new flag never needs a new endpoint** —
  extend the one `FLAG_REGISTRY` object, the shared `FeatureFlags` type, and the client
  store's `DEFAULTS` literal; the endpoint and fetch path are already generic.
- **The client store must never block `profileStore.ready` or the app's loading screen** on
  the flag fetch — it's a network call, and this app is offline-first. `featureFlags.init()`
  applies the last IndexedDB-cached value first (works fully offline), then refreshes from
  the server in the background.
- **Wire the store's `init()` from `+layout.svelte`'s `onMount`**, the same convention
  `pwaStore`/`networkStore` already use (an `initialized` guard, not a self-initializing
  constructor). `profileStore` is the one exception to this pattern, and deliberately so — it
  self-initializes because routing decisions depend on it before the layout even mounts. A
  feature-flag store has no such urgency, and nothing else imports it early enough to trigger
  a constructor-based self-init in the shipped bundle until something actually reads it.
- **Any `$state` object this store persists to IndexedDB must be unwrapped first** — see
  Invariant 3. This bit a real `DataCloneError` during development: `featureFlags.flags` is a
  Svelte 5 `$state` Proxy, and `idb-keyval`'s `set()` can't structured-clone it directly.

---

## 📁 Repository Directory Map

```text
OpenLove/
├── .agents/skills/             # Skill instructions (e.g. prisma-upgrade-v7)
├── data/                       # Persistent directory for SQLite (openlove.db) & VAPID keys (vapid.json)
├── prisma/
│   └── schema.prisma           # Prisma v7 schema: PushSubscription/SubscriptionBond
│                                #   (Invariant 1) + SharedImage (Invariant 11)
├── scripts/
│   ├── build-image.js          # Multi-arch Podman container build script
│   ├── publish-image.js        # Multi-arch Docker Hub publish script
│   ├── release.js              # Full pipeline (build + publish)
│   ├── make-icons.js           # PWA PNG icon generator
│   ├── build.sh / publish.sh   # Bash wrapper scripts
│   ├── build.ps1 / publish.ps1 # PowerShell wrapper scripts
├── src/
│   ├── app.css                 # Tailwind 4 @theme tokens & light/dark color variables
│   ├── app.html                # HTML shell with PWA meta tags (fonts are self-hosted via app.css)
│   ├── service-worker.ts       # THE service worker: precache + nav fallback + push + sync
│   ├── hooks.server.ts         # SvelteKit server hook (boots background milestone scheduler)
│   ├── lib/
│   │   ├── components/
│   │   │   ├── bonds/          # BondSwitcherDrawer (multi-bond list, switch, add, edit entry point)
│   │   │   ├── offline/        # SyncStatusPill (offline / N-changes-pending indicator)
│   │   │   ├── onboarding/
│   │   │   │   ├── OnboardingFlow.svelte  # Thin stepper shell: nav, footer, shared draft state
│   │   │   │   └── steps/      # OverviewStep, PwaInstallStep, NamesStep, DateStep, PhotoStep, StyleStep
│   │   │   ├── pwa/            # PWAToast: the single SW registration + update/offline-ready toast
│   │   │   ├── settings/
│   │   │   │   ├── SettingsSheet.svelte      # Thin orchestrator: mode resolution + composition
│   │   │   │   ├── BondIdentityForm.svelte   # Type, names, date, photo
│   │   │   │   ├── MilestonePrefsEditor.svelte # Per-bond notification toggle + category prefs
│   │   │   │   ├── MilestonesList.svelte     # Milestone list + custom-milestone add/delete
│   │   │   │   ├── PushNotificationPanel.svelte # Device-wide push subscription card
│   │   │   │   └── StorageBackupPanel.svelte # Storage estimate, backup/restore/reset
│   │   │   ├── share/          # ShareModal, PartnerInviteModal, ScanImportModal (QR scanner)
│   │   │   ├── shared/         # BondTypeSelector, ThemeSelector, ColorModeSelector,
│   │   │   │                   #   ColorPaletteSelector — used by both SettingsSheet and
│   │   │   │                   #   OnboardingFlow via `variant`/`layout` props (see H3/H5 below)
│   │   │   ├── themes/
│   │   │   │   ├── shared/     # ThemeIconButton, HeroCounterCard, StatBreakdownGrid,
│   │   │   │   │               #   NextMilestoneCard — used by both ModernTheme and CoverTheme
│   │   │   │   ├── ModernTheme.svelte, CoverTheme.svelte, TraditionalTheme.svelte, registry.ts
│   │   │   └── ui/             # shadcn-style UI atoms (Button, Card, Modal, Switch, Badge, etc.)
│   │   ├── generated/prisma/   # Generated Prisma v7 client output
│   │   ├── push/
│   │   │   └── client.ts       # Push subscribe/unsubscribe as an *intent*; routes via the outbox
│   │   ├── server/
│   │   │   ├── db.ts           # Prisma 7 client instance with PrismaBetterSqlite3
│   │   │   ├── push.ts         # Server WebPush sender & VAPID key manager
│   │   │   ├── scheduler.ts    # Hourly timezone-aware milestone background scheduler (see Invariant 10)
│   │   │   ├── sync.ts         # Idempotent, last-write-wins sync op handlers
│   │   │   ├── featureFlags.ts # Env-driven flag registry, resolved fresh per call (Invariant 12)
│   │   │   └── sharedImage.ts  # Encrypted-photo relay storage + TTL cleanup scheduler (Invariant 11)
│   │   ├── storage/
│   │   │   ├── db.ts           # IndexedDB profile & photo blob storage (idb-keyval)
│   │   │   └── outbox.ts       # Sync outbox + coalescing + sync-meta (DOM-free: SW imports it)
│   │   ├── stores/
│   │   │   ├── featureFlags.svelte.ts # Client fetch/cache for server-resolved flags (Invariant 12)
│   │   │   ├── network.svelte.ts # Online state + pending-sync count
│   │   │   ├── profile.svelte.ts # Reactive profile store + onProfileMutation hook registry
│   │   │   └── pwa.svelte.ts   # Install prompt, standalone detection, storage persistence
│   │   ├── sync/
│   │   │   ├── core.ts         # Outbox delivery, backoff (DOM-free: SW imports it)
│   │   │   └── index.ts        # Mutation funnel + platform flush triggers (window only)
│   │   ├── types/              # TypeScript interfaces (profile, time, milestones, featureFlags)
│   │   └── utils/
│   │       ├── base64.ts       # VAPID key decoding (DOM-free: SW imports it)
│   │       ├── clipboard.ts    # Robust fallback clipboard copying
│   │       ├── imageBase64.ts  # Blob<->base64 (backup photos) + shared byte-level primitives
│   │       ├── imageCrypto.ts  # Client-side AES-GCM encrypt/decrypt for relayed photos (Invariant 11)
│   │       ├── pwa.ts          # Standalone PWA detection (iOS Safari, Android, Desktop)
│   │       ├── share.ts        # decodeSharePayloadString + detectFullBackup — single source of
│   │       │                   #   truth for share-payload parsing (see Invariant 9)
│   │       ├── shareImage.ts   # uploadSharedImage/fetchSharedImage — fail-soft relay client (Invariant 11)
│   │       ├── storage.ts      # navigator.storage persist()/estimate() helpers
│   │       └── time.ts         # Exact calendar time & multi-category milestone calculations
│   └── routes/
│       ├── +layout.ts          # prerender = true, ssr = false (the precached SPA shell)
│       ├── +layout.svelte      # Root layout: store init, sync triggers, PWA toast
│       ├── +page.svelte        # Main route (switches between Onboarding and Active Theme)
│       └── api/
│           ├── push/
│           │   ├── sync/             # POST: Batch sync ops (upsert/delete), idempotent + LWW
│           │   ├── subscribe/        # POST: Legacy wrapper over the sync handler
│           │   ├── unsubscribe/      # POST: Legacy wrapper over the sync handler
│           │   ├── test/             # POST: dev-only, sends an immediate test push
│           │   ├── trigger-scheduler/ # POST: dev-only, manually runs the milestone scheduler
│           │   └── vapid-public-key/ # GET: Returns public VAPID key
│           └── share/
│               ├── config/           # GET: Resolved feature flags (Invariant 12)
│               └── image/
│                   ├── (+server.ts)  # POST: Store encrypted photo ciphertext (Invariant 11)
│                   └── [id]/         # GET: Fetch ciphertext by id; repeatable, TTL-checked
├── Dockerfile                  # Multi-stage, multi-arch production Dockerfile
├── docker-compose.yml          # 1-command deployment setup
├── scripts/verify-precache.js  # Post-build assertion that the app is really offline-capable
├── prisma.config.ts            # Prisma 7 CLI configuration
├── package.json                # Project manifests, dependencies & devops scripts
└── README.md                   # Public documentation & deployment guide
```

---

## 🧩 Key Subsystems Breakdown

### 1. Extensible Theme & Multi-Bond Architecture
- Located in [`src/lib/components/themes/`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/themes/).
- Registered in [`registry.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/themes/registry.ts).
- Themes implement `ThemeProps` (`profile`, `bond`, `timeBreakdown`, `nextMilestone`, `milestones`, `onOpenSettings`, `onOpenShare`, `onOpenSwitcher`).
- Current themes:
  - **`modern`**: Glassmorphic cards, glowing avatar, accent color palettes (*Rose, Lavender, Terracotta, Sage, Midnight*).
  - **`cover`**: Full-bleed cover photo with clean top header and floating metric cards.
  - **`traditional`**: Authentic replica of classic "My Love" design with deep crimson header and serif typography.
- **`modern` and `cover` compose from `themes/shared/`** (`ThemeIconButton`, `HeroCounterCard`,
  `StatBreakdownGrid`, `NextMilestoneCard`) rather than duplicating markup. These two themes use
  **different Tailwind tokens for the same-looking cards** (padding, icon size, `backdrop-blur-md`,
  `min-w-0` — Cover is deliberately more compact to leave room for its cover photo), captured as an
  explicit `variant: 'default' | 'compact'` prop on each shared component. **Never** collapse that
  difference to "unify" the two themes further — see the `ui-refactor-verification` skill before
  touching any of these. `traditional`'s layout is different enough it doesn't share these.
- **Per-Bond Customization**: Each `Bond` independently configures its own `uiTheme`, `colorPalette`, `colorMode`, `showSeconds`, `milestonePrefs`, and `notificationsEnabled`.
- **Unified Settings**: [`SettingsSheet.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/settings/SettingsSheet.svelte)
  is a thin orchestrator (mode resolution + composition) over `BondIdentityForm`,
  `MilestonePrefsEditor`, `MilestonesList`, `PushNotificationPanel`, `StorageBackupPanel`, and the
  `shared/` selectors — it provides scoped bond editing and applies progressive disclosure (omits
  the Active Bond header when only 1 bond exists). **When adding a new settings control**, decide
  which of those five components it belongs in (or whether it's genuinely a new one) rather than
  adding directly to `SettingsSheet.svelte` — it was 1,212 lines before this split and is
  deliberately kept thin now. The bond-type/theme/color-mode/palette pickers it uses are the same
  `shared/` components `OnboardingFlow` uses — check there first before writing a new picker.

### 2. Multi-Category Milestone Engine ([`src/lib/utils/time.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/time.ts))
- **Months**: 1st through 11th months, 18 months, 30 months, 42 months, etc.
- **Years**: 1st anniversary, 2nd, 5th, 10th, 25th silver, 50th golden, etc.
- **Days**: 50, 100, 150, 200, 500, 1000, 2500, 5000, 10000 days (supports 'all', 'major', or 'off' filters).
- **Custom**: User-created custom relationship events (*First Date, Moved In, Proposal*).
- Sorted chronologically by target date with exact countdowns (`daysRemaining`).

### 3. Progressive Partner Sharing & QR Code Import
- **Share Modal ([`ShareModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/ShareModal.svelte))**: Generates instant QR code and share link encoded with `#import=<base64-json>`.
- **Partner Invite & Preview Modal ([`PartnerInviteModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/PartnerInviteModal.svelte))**:
  - **Unconfigured Users (A)**: Smart landing options (*Install App pre-synced, Copy Sync Code, Continue in Browser*).
  - **Single-Bond Users (B)**: Displays incoming preview with choices to **➕ Add as New Bond** or **🔄 Replace Current Bond**.
  - **Multi-Bond Users (C)**: Displays incoming preview with choice to **➕ Add to My Bonds**.
  - This preview/replace/add flow is for **single-bond invites only**. It is never shown for a
    full multi-bond backup — see Invariant 9.
- **QR Code Scanner ([`ScanImportModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/ScanImportModal.svelte))**: Real-time camera scanner (`jsqr`), image upload, and paste code handler with preview confirmation.
- **Add Bond Integration**: Top-level action in the Add Bond sheet to directly scan or paste shared partner profiles.
- **Decode/detect logic** (`#import=` URL parsing, bare base64 sync codes, full-backup detection)
  is centralized in [`src/lib/utils/share.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/share.ts)
  and shared by `ScanImportModal.svelte`, `+page.svelte`'s hash effect, and
  `profileStore.parseSharePayload`. **Do not** reimplement any of it inline at a new call site —
  import from `share.ts`. See the `share-import-safety` skill before touching any of this.
- **Optional photo sharing**: `ShareModal.svelte`'s "Share Photo" toggle (shown only when the
  active bond has a photo and `FEATURE_SHARE_IMAGES` is on) uploads it encrypted to the relay
  and embeds a small `{shareId,key,iv,mimeType}` reference — not the photo itself — in the same
  compact payload. Greyed out while offline (`networkStore.isOnline`), matching
  `PushNotificationPanel.svelte`'s identical pattern for the same reason. See Invariant 11.

### 4. Onboarding Wizard
- [`OnboardingFlow.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/onboarding/OnboardingFlow.svelte)
  is a thin stepper shell (progress header, footer nav, shared draft `$state`) over six step
  components in `onboarding/steps/`: `OverviewStep`, `PwaInstallStep` (skipped when already
  running standalone), `NamesStep`, `DateStep`, `PhotoStep`, `StyleStep`.
- **State ownership is deliberate, not automatic** — a value stays in `OnboardingFlow` itself
  (passed down as a prop) whenever something *outside* the step that sets it also needs to read
  it. The clearest example: the footer's "Continue"/"Continue in Browser" label reads
  `installSuccess`, even though only `PwaInstallStep`'s markup sets it. Before moving a piece of
  step state further down, check the `ui-refactor-verification` skill's state-ownership section.
- `StyleStep` composes the same `shared/` `ThemeSelector`/`ColorModeSelector` components
  `SettingsSheet` uses, with `layout="detailed"` (icon + circular check badge) instead of Settings'
  `layout="compact"` (label + inline check) — see subsystem 1 above.

### 5. JSON Backups & Photo Sharing (two different photo mechanisms, on purpose)
Photos travel through this app two genuinely different ways, chosen per transport — see
Invariant 11 for the full reasoning, `share-import-safety` for the wire-shape details:

- **JSON *file* backups** (`StorageBackupPanel.svelte`'s "Download JSON Backup (All Bonds)",
  `ShareModal.svelte`'s "Download Bond JSON File", and both files' restore paths): each bond's
  photo travels **inline as base64** (`profileStore.exportBackupJSON()` / `importJSON()`'s
  `photo` field). No server involvement, never expires, works fully offline — matches this
  being the app's own "keep a backup, this is the only copy" safety net. **Not** gated by
  `FEATURE_SHARE_IMAGES` — that flag only gates the public upload endpoint, and a user
  downloading their own file to their own disk isn't a server-relay concern.
- **QR/link/sync-code shares** (`ShareModal.svelte`'s toggle): the photo is relayed
  encrypted through the server instead (`sharedImage` field) — see subsystem 3 and
  Invariant 11.
- These two field names (`photo` vs `sharedImage`) are deliberately never handled by the same
  code path — `photo` is decoded synchronously inside `normalizeIncomingBond()` (used by the
  invite *preview* too); `sharedImage` is only ever resolved inside `importJSON()`'s Case 2,
  at actual commit time. If a payload somehow carried both, `importJSON()` prefers the
  already-decoded inline `photo` and never touches the relay.

---

## 🛠️ Common Commands & Workflows

### Development
```bash
# Start development server on port 5173
pnpm dev

# Run TypeScript & Svelte syntax diagnostics
pnpm check

# Build production bundle locally
pnpm build

# Sync SQLite database schema
pnpm prisma:push
```

### Testing
```bash
# Run the unit test suite once
pnpm test

# Watch mode
pnpm test:watch
```
`vitest.config.ts` scopes tests to `src/**/*.test.ts` and deliberately configures **no DOM
environment** — every current test target is a pure function (date/milestone math in `time.ts`,
outbox coalescing in `outbox.ts`, share-payload parsing in `share.ts`) or a server module with its
Prisma-touching `./db` import mocked out (`server/sync.ts`, `server/scheduler.ts` — see those
`*.test.ts` files for the `vi.hoisted` + in-memory-fake-Prisma pattern). Prefer this style of test
— fast, no browser, no real database — over reaching for a DOM testing library.

For anything that actually renders (a new shared component, a theme, a settings/onboarding flow
change), **there is no automated UI test suite** — verify by running the app
(`pnpm dev`/`pnpm build && pnpm preview`) and, for anything claiming not to change existing visual
output, see the `ui-refactor-verification` skill for the Playwright screenshot-diff pattern this
codebase's refactor history used to actually prove that, rather than eyeballing it.

### Container DevOps & Release
```bash
# Build multi-arch container image (AMD64 + ARM64)
pnpm image:build

# Publish multi-arch container image to Docker Hub
pnpm image:publish

# Full release pipeline (build + publish)
pnpm image:release
```
*(PowerShell wrappers `.\build.ps1`, `.\publish.ps1` are also available).*

---

## 💡 Quick Tips for Future Agents

- **When adding a new settings control**: Decide which of `BondIdentityForm`,
  `MilestonePrefsEditor`, `MilestonesList`, `PushNotificationPanel`, or `StorageBackupPanel`
  (all in `src/lib/components/settings/`) it belongs in — rather than adding directly to
  `SettingsSheet.svelte`, which is deliberately kept thin (orchestration only) after being split
  out of a 1,212-line file. Add reactive state in [`src/lib/stores/profile.svelte.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/stores/profile.svelte.ts)
  and update `CoupleProfile`/`Bond` types in [`src/lib/types/`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/types/) as needed.
- **When adding a control that could appear in both Settings and Onboarding** (a picker/selector):
  check `src/lib/components/shared/` first (`BondTypeSelector`, `ThemeSelector`,
  `ColorModeSelector`, `ColorPaletteSelector`). Each already takes a `variant`/`layout` prop for
  the two contexts' different Tailwind tokens — read the `ui-refactor-verification` skill before
  assuming the two contexts render identically enough to reuse without one.
- **When adding a new onboarding step**: add it to `src/lib/components/onboarding/steps/` and
  wire it into `OnboardingFlow.svelte`'s step list — don't add it inline. Check whether anything
  outside the step (the footer, another step) needs to read its state before deciding where that
  state should live; see subsystem 4 above.
- **When adding new themes**: Create `YourTheme.svelte` under `src/lib/components/themes/` and register it in `registry.ts` and `THEMES` list. Reuse `themes/shared/` components (`ThemeIconButton`, `HeroCounterCard`, `StatBreakdownGrid`, `NextMilestoneCard`) where the new theme's layout genuinely matches Modern/Cover's card structure — but verify with the `ui-refactor-verification` skill's pixel-diff pattern before claiming it does, don't assume from a glance.
- **When modifying push notifications**: Check [`src/lib/server/push.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/push.ts) (server), [`src/lib/server/scheduler.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/scheduler.ts) (cron — see Invariant 10 before touching its date comparisons), [`src/service-worker.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/service-worker.ts) (notification display), and [`src/lib/push/client.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/push/client.ts) (subscribe as intent).
- **When adding a field the server needs**: extend `SyncOp` in [`src/lib/types/sync.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/types/sync.ts), handle it in [`src/lib/server/sync.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/sync.ts), amend the Invariant 1 column list **in the same PR**, and extend the `onProfileMutation` hook in [`src/lib/sync/index.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/sync/index.ts).
- **Before importing any payload of unverified shape via `profileStore.importJSON()`**: check
  `detectFullBackup()` first. See Invariant 9 and the `share-import-safety` skill — this is a real
  data-loss trap, not a style nitpick.
- **Before writing or approving any date comparison meant to answer "same calendar day"**:
  compare local `Date` getters, never `.toISOString()`. See Invariant 10 and the
  `share-import-safety` skill.
- **Before claiming a Svelte/Tailwind change has "zero visual impact"**: verify it — see the
  `ui-refactor-verification` skill for the Playwright pixel-diff pattern and its specific gotchas
  (`page.clock.setFixedTime` vs. `install()+pauseAt()` breaking `Modal.svelte`'s entrance
  transition; `canvas-confetti` not being CSS-animation-driven).
- **When touching anything PWA-related**: verify against `pnpm build && pnpm preview`, never `pnpm dev`. Then check DevTools → Application: exactly one service worker at scope `/`, script `/service-worker.js`, and a populated `workbox-precache-v2` cache containing `/`.
- **Before adding a dependency the service worker imports**: it must be a *direct* dependency. pnpm's strict layout will not resolve transitive packages from either the SW source or `virtual:pwa-register`.
- **Run `pnpm test` alongside `pnpm check`/`pnpm build`** before considering a non-trivial logic
  change done. See "Testing" under Common Commands.
- **When adding a new env-driven feature toggle**: don't reach for `$env/static/public` or a
  server `load` function — see Invariant 12 for why that only sees the build-time value in this
  app. Add one entry to `FLAG_REGISTRY` in `src/lib/server/featureFlags.ts`, one field on
  `FeatureFlags` (`src/lib/types/featureFlags.ts`), and one field in the client store's
  `DEFAULTS` (`src/lib/stores/featureFlags.svelte.ts`) — the endpoint and fetch/cache path are
  already generic and need no changes.
- **Before touching the encrypted photo relay** (`SharedImage`, `sharedImage.ts`,
  `imageCrypto.ts`, `shareImage.ts`, or `ShareModal.svelte`'s photo toggle): read Invariant 11
  first — the read-once-vs-TTL design decision and the never-fetch-during-preview rule are both
  easy to get backwards by "obvious-looking" instinct.
- **When adding a UI action that needs the network** (uploads, live fetches): check
  `networkStore.isOnline` and grey it out / disable it while offline, the same pattern
  `PushNotificationPanel.svelte`'s test buttons and `ShareModal.svelte`'s photo toggle both use
  — don't rely on the action's own fail-soft handling alone to communicate that to the user.

## 📚 Skills

Project-specific skill instructions live in `.agents/skills/`. Load these before touching the
areas they cover — they exist because each one documents a real bug found and fixed in this
codebase, not a hypothetical:

- **`share-import-safety`** — `profileStore.importJSON()`'s full-backup branch ignoring `mode`,
  `profileStore.ready` timing for mount-time effects, reactive-effect re-entrancy,
  local-vs-UTC date comparisons, and the two photo-arrival wire shapes (inline `photo` vs relay
  `sharedImage`) and why they're never handled by the same code path (Invariants 8, 9, 10, 11).
- **`ui-refactor-verification`** — how to safely extract/unify near-duplicate Svelte/Tailwind UI
  in this app and how to actually verify "zero visual impact" with Playwright, including its
  gotchas specific to this codebase (`Modal.svelte`'s rAF-dependent transition, `canvas-confetti`).

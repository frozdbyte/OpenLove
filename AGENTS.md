# AGENTS.md — Developer & AI Agent Guide for OpenLove ❤️

Welcome! This document is the **single source of truth** for human contributors and AI agents working on **OpenLove**. It outlines the core philosophy, technical architecture, recent changes, directory layout, and strict invariants you must follow.

---

## 🎯 Project Overview & Core Philosophy

**OpenLove** is a free, self-hosted, privacy-first relationship tracker and anniversary reminder alternative to "My Love".

### Core Values
1. **Zero-Knowledge Privacy**: Couple names, anniversary start dates, high-resolution photo blobs, and personal notes are stored **strictly on the user's client device in IndexedDB**.
2. **Anonymous Minimalist Backend**: The server SQLite database stores **only** anonymous Web Push tokens, together-since dates (for milestone computation), and subscriber timezones.
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
| **Sharing & Sync** | URL Hash + QR Code | `#import=<base64-json>` + QR camera scanner (`jsqr`) & QR generator (`qrcode`). |
| **Containerization** | Multi-Arch Docker/Podman | Multi-stage build with `--platform=$BUILDPLATFORM` for native host compilation. |

---

## 🚨 Strict Invariants & Agent Rules (Must Follow)

### 1. Privacy Invariant (CRITICAL)
- **NEVER** create database columns, server endpoints, or logs that accept couple names, messages, or photo files.
- The server SQLite DB (`data/openlove.db`) must strictly hold:
  `{ id, endpoint, p256dh, auth, togetherSince, timezone, lastNotified, clientUpdatedAt, createdAt, updatedAt }`.
- `clientUpdatedAt` is an ISO-8601 timestamp on the **client** clock, added in v1.4.0 for
  last-write-wins sync (see Invariant 7). It is a timestamp, not personal data — the privacy
  invariant is intact — but this allowlist must be kept accurate.

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
- **Background Sync is a progressive enhancement, never the mechanism.** Neither Safari nor
  Firefox supports it. The baseline is four foreground triggers: app start, `online`,
  `visibilitychange`, and an opportunistic flush on `push`.
- **Do not use `workbox-background-sync`.** Its queue lives in an opaque IndexedDB store the
  window cannot inspect, which makes both the coalescing rules and the pending-changes UI
  impossible.
- **`navigator.onLine` is a hint only** — it reports `true` behind captive portals. It may drive
  presentation, never a decision to skip a flush.

---

## 📁 Repository Directory Map

```text
OpenLove/
├── .agents/skills/             # Skill instructions (e.g. prisma-upgrade-v7)
├── data/                       # Persistent directory for SQLite (openlove.db) & VAPID keys (vapid.json)
├── prisma/
│   └── schema.prisma           # Prisma v7 schema with PushSubscription model
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
│   │   │   ├── offline/        # SyncStatusPill (offline / N-changes-pending indicator)
│   │   │   ├── onboarding/     # 5-step interactive onboarding wizard
│   │   │   ├── pwa/            # PWAToast: the single SW registration + update/offline-ready toast
│   │   │   ├── settings/       # Customization drawer, dark mode, color accents, push toggle
│   │   │   ├── share/          # ShareModal, PartnerInviteModal, ScanImportModal (QR scanner)
│   │   │   ├── themes/         # ModernTheme, TraditionalTheme, and theme registry
│   │   │   └── ui/             # shadcn-style UI atoms (Button, Card, Modal, Switch, Badge, etc.)
│   │   ├── generated/prisma/   # Generated Prisma v7 client output
│   │   ├── push/
│   │   │   └── client.ts       # Push subscribe/unsubscribe as an *intent*; routes via the outbox
│   │   ├── server/
│   │   │   ├── db.ts           # Prisma 7 client instance with PrismaBetterSqlite3
│   │   │   ├── push.ts         # Server WebPush sender & VAPID key manager
│   │   │   ├── scheduler.ts    # Hourly timezone-aware milestone background scheduler
│   │   │   └── sync.ts         # Idempotent, last-write-wins sync op handlers
│   │   ├── storage/
│   │   │   ├── db.ts           # IndexedDB profile & photo blob storage (idb-keyval)
│   │   │   └── outbox.ts       # Sync outbox + coalescing + sync-meta (DOM-free: SW imports it)
│   │   ├── stores/
│   │   │   ├── network.svelte.ts # Online state + pending-sync count
│   │   │   ├── profile.svelte.ts # Reactive profile store + onProfileMutation hook registry
│   │   │   └── pwa.svelte.ts   # Install prompt, standalone detection, storage persistence
│   │   ├── sync/
│   │   │   ├── core.ts         # Outbox delivery, backoff (DOM-free: SW imports it)
│   │   │   └── index.ts        # Mutation funnel + platform flush triggers (window only)
│   │   ├── types/              # TypeScript interfaces (profile, time, milestones)
│   │   └── utils/
│   │       ├── base64.ts       # VAPID key decoding (DOM-free: SW imports it)
│   │       ├── clipboard.ts    # Robust fallback clipboard copying
│   │       ├── pwa.ts          # Standalone PWA detection (iOS Safari, Android, Desktop)
│   │       ├── storage.ts      # navigator.storage persist()/estimate() helpers
│   │       └── time.ts         # Exact calendar time & multi-category milestone calculations
│   └── routes/
│       ├── +layout.ts          # prerender = true, ssr = false (the precached SPA shell)
│       ├── +layout.svelte      # Root layout: store init, sync triggers, PWA toast
│       ├── +page.svelte        # Main route (switches between Onboarding and Active Theme)
│       └── api/push/
│           ├── sync/           # POST: Batch sync ops (upsert/delete), idempotent + LWW
│           ├── subscribe/      # POST: Legacy wrapper over the sync handler
│           ├── unsubscribe/    # POST: Legacy wrapper over the sync handler
│           ├── test/           # POST: Triggers immediate test push notification
│           └── vapid-public-key/ # GET: Returns public VAPID key
├── Dockerfile                  # Multi-stage, multi-arch production Dockerfile
├── docker-compose.yml          # 1-command deployment setup
├── scripts/verify-precache.js  # Post-build assertion that the app is really offline-capable
├── prisma.config.ts            # Prisma 7 CLI configuration
├── package.json                # Project manifests, dependencies & devops scripts
└── README.md                   # Public documentation & deployment guide
```

---

## 🧩 Key Subsystems Breakdown

### 1. Extensible Theme System (SOLID Open/Closed Principle)
- Located in [`src/lib/components/themes/`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/themes/).
- Registered in [`registry.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/themes/registry.ts).
- Themes implement `ThemeProps` (`profile`, `timeBreakdown`, `nextMilestone`, `milestones`, `onOpenSettings`, `onOpenShare`).
- Current themes:
  - **`modern`**: Glassmorphic cards, glowing avatar, accent color palettes (*Rose, Lavender, Terracotta, Sage, Midnight*).
  - **`traditional`**: Authentic replica of classic "My Love" design with deep crimson header and serif typography.

### 2. Multi-Category Milestone Engine ([`src/lib/utils/time.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/utils/time.ts))
- **Months**: 1st through 11th months, 18 months, 30 months, 42 months, etc.
- **Years**: 1st anniversary, 2nd, 5th, 10th, 25th silver, 50th golden, etc.
- **Days**: 50, 100, 150, 200, 500, 1000, 2500, 5000, 10000 days.
- **Custom**: User-created custom relationship events (*First Date, Moved In, Proposal*).
- Sorted chronologically by target date with exact countdowns (`daysRemaining`).

### 3. Partner Sharing & QR Code Sync
- **Share Modal ([`ShareModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/ShareModal.svelte))**: Generates instant QR code and share link encoded with `#import=<base64-json>`.
- **Partner Invite Modal ([`PartnerInviteModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/PartnerInviteModal.svelte))**: When partner opens a share link in a browser, offers 3 options:
  1. Add to Home Screen (installs PWA pre-configured).
  2. Copy Sync Code (for existing PWA installations).
  3. Continue in browser.
- **QR Code Scanner ([`ScanImportModal.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/share/ScanImportModal.svelte))**: Real-time camera scanner using `jsqr` to scan partner QR codes with paste code fallback.

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

- **When adding new settings**: Add reactive state in [`src/lib/stores/profile.svelte.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/stores/profile.svelte.ts), update `CoupleProfile` type in [`src/lib/types/profile.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/types/profile.ts), and render the control in [`src/lib/components/settings/SettingsSheet.svelte`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/components/settings/SettingsSheet.svelte).
- **When adding new themes**: Create `YourTheme.svelte` under `src/lib/components/themes/` and register it in `registry.ts` and `THEMES` list.
- **When modifying push notifications**: Check [`src/lib/server/push.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/push.ts) (server), [`src/lib/server/scheduler.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/scheduler.ts) (cron), [`src/service-worker.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/service-worker.ts) (notification display), and [`src/lib/push/client.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/push/client.ts) (subscribe as intent).
- **When adding a field the server needs**: extend `SyncOp` in [`src/lib/types/sync.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/types/sync.ts), handle it in [`src/lib/server/sync.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/server/sync.ts), amend the Invariant 1 column list **in the same PR**, and extend the `onProfileMutation` hook in [`src/lib/sync/index.ts`](file:///c:/Users/Jaro/Documents/GitHub/OpenLove/src/lib/sync/index.ts).
- **When touching anything PWA-related**: verify against `pnpm build && pnpm preview`, never `pnpm dev`. Then check DevTools → Application: exactly one service worker at scope `/`, script `/service-worker.js`, and a populated `workbox-precache-v2` cache containing `/`.
- **Before adding a dependency the service worker imports**: it must be a *direct* dependency. pnpm's strict layout will not resolve transitive packages from either the SW source or `virtual:pwa-register`.

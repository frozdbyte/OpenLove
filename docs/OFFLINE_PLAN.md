# OpenLove — True Offline PWA Implementation Plan

> Status: proposed · Target: v1.4.0 · Author: planning pass, 2026-08-26
>
> The README claims **"PWA & Offline Ready … with offline caching."** As of `51ea874`
> that is not true: **zero assets are precached and the app hard-fails without a network.**
> This document explains exactly why, then lays out a phased fix that also closes a live
> data-sync bug that exists even when fully online.

---

## Part 0 — What is actually broken

Everything below was verified against `build/client/` from the committed build output, not inferred.

### F1 · Two service workers compete, and the winner has no push handler

There are two independent service worker scripts being emitted:

| Script | Source | Contains |
| :-- | :-- | :-- |
| `/service-worker.js` | `src/service-worker.ts` (SvelteKit built-in) | `push` + `notificationclick` handlers. **No caching whatsoever.** |
| `/sw.js` | `vite.config.ts` → `strategies: 'generateSW'` (Workbox) | Precache manifest + navigation route. **No push handler.** |

Only one service worker can control scope `/`. Registration happens in two places, both
preferring `sw.js`:

- `build/client/registerSW.js` (auto-injected by the plugin) → `register('./sw.js')`
- `src/lib/stores/pwa.svelte.ts` → `register('/sw.js')`, falling back to `/service-worker.js`
  only if the first promise *rejects*

So the architecture is currently **offline caching XOR push notifications** — never both.

### F2 · `sw.js` throws during evaluation, so nothing is ever cached

The last line of the generated `build/client/sw.js`:

```js
workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/")));
```

`createHandlerBoundToURL()` throws `WorkboxError('non-precached-url')` when the URL is not
in the precache manifest. The manifest in `sw.js` has 21 entries — icons,
`_app/immutable/*`, `manifest.webmanifest`, and (absurdly) `service-worker.js` and
`registerSW.js` — but:

```
$ grep -o '"url": "[^"]*"' build/client/sw.js | grep -E '"/"|index.html' | wc -l
0
```

There is **no `/` and no `index.html`**, because `adapter-node` server-renders the root
route and emits no HTML document (`build/prerendered/` does not exist).

**Consequence chain:** `sw.js` throws → registration rejects → `pwa.svelte.ts`'s silent
`.catch()` falls through to `/service-worker.js` → push works, precaching never happens.
That silent catch is what has been masking this bug.

> This single line is the whole reason "offline ready" is a lie. Fixing it is Phase 1–2.

### F3 · `mode: 'development'` is hardcoded

`vite.config.ts` passes `mode: 'development'` to `SvelteKitPWA`, so **production builds are
generated with development semantics.** Almost certainly a leftover from debugging.

### F4 · Fonts are a third-party runtime dependency

`src/app.html` loads Playfair Display and Plus Jakarta Sans from `fonts.googleapis.com`
with no runtime caching. Offline, both themes fall back to system fonts — the Traditional
theme in particular stops looking like itself. It is also an IP leak to Google on every
cold load, which sits badly with a privacy-first product.

### F5 · `togetherSince` is never re-synced to the server — a live bug, online or off

`togetherSince` is sent to the server **exactly once**, inside `subscribeToPush()`
(`src/lib/push/client.ts:98`). But it is mutated in three other places that never touch
the network:

- `src/lib/components/settings/SettingsSheet.svelte:191` — the date picker `onchange`
- `src/lib/components/onboarding/OnboardingFlow.svelte:106,130`
- `profileStore.importJSON()` — QR scan / partner share link import

**Change your anniversary date after subscribing and the server keeps firing milestone
pushes on the old schedule, forever.** The same applies to `timezone`, which is captured
once at subscribe time and never refreshed when the user travels.

This is not an offline problem. Offline support just makes it worse, and fixing it
properly requires the same plumbing.

### F6 · Every server write is fire-and-forget with no retry

`subscribeToPush()` and `unsubscribeFromPush()` are bare `fetch` calls. Offline they throw,
the UI reports a failure, and local state silently diverges from the server.

`unsubscribeFromPush()` is worse — it calls `subscription.unsubscribe()` **first**, then
tries the server `DELETE`. Offline, that orphans a server row pointing at a dead endpoint.
The order is backwards.

### F7 · `pushsubscriptionchange` is unhandled

Push services rotate endpoints. When that happens the server row becomes undeliverable and
the user silently stops receiving notifications with no error anywhere.

### F8 · IndexedDB is the database, and it is not persisted

There is no `navigator.storage.persist()` call anywhere. Per the zero-knowledge invariant,
IndexedDB holds the **only** copy of the couple's names, date, and photo. iOS Safari evicts
IndexedDB for non-installed web apps after roughly 7 days of inactivity. That is silent,
unrecoverable data loss for the app's core value proposition.

---

## Part 1 — Target architecture

Two changes carry most of the weight:

**1. One service worker.** Switch from `generateSW` to `injectManifest` and hand-write a
single SW that does precaching *and* push *and* sync. This structurally eliminates F1.

**2. A prerendered SPA shell.** The root route is already 100% client-rendered — every byte
of UI state comes from IndexedDB. Making it a prerendered static document gives Workbox a
real `/` to precache and serve as the navigation fallback, eliminating F2.

### The sync model, stated plainly

The critical simplification: **sync is strictly one-directional.**

- The client is the sole authority for `togetherSince`, `timezone`, and the push keys.
- The server owns exactly one field the client never reads: `lastNotified`.

So there is no merge, no pull phase, and no conflict resolution against server state. The
whole problem collapses to: *a reliable at-least-once outbox, with idempotent, last-write-wins
server handlers.* Everything in Phases 4–6 follows from that.

```
┌─────────────────────────────────────────────────────────┐
│  Window (Svelte)                                        │
│    profileStore.update({ togetherSince })               │
│              │                                          │
│              ▼                                          │
│    queueSubscriptionSync()  ──►  outbox (IndexedDB)     │
└──────────────────────────────────────┬──────────────────┘
                                       │  shared IDB store
┌──────────────────────────────────────┴──────────────────┐
│  Service Worker (src/sw.ts)                             │
│    'sync' event ──┐                                     │
│    'push' event ──┼──►  flushOutbox()                   │
│    'message'   ───┘          │                          │
└──────────────────────────────┼──────────────────────────┘
                               ▼
                   POST /api/push/sync  { ops: [...] }
                               │
                               ▼
                   SQLite · upsert by endpoint
                   guarded by clientUpdatedAt (LWW)
```

Flush is *also* triggered from the window on app start, `online`, and `visibilitychange` —
those foreground triggers are the baseline, and Background Sync is a progressive
enhancement. See Phase 6 for why that ordering matters on iOS.

---

## Phase 1 — Collapse to a single service worker

**Effort: ~half a day. Unblocks everything else.**

1. **Delete `src/service-worker.ts`** and create **`src/sw.ts`**. Using a different filename
   is deliberate: it stops SvelteKit from building its own competing `/service-worker.js`,
   which is the root of F1.

2. Add explicit Workbox devDependencies. They exist transitively at `7.4.1` under
   `node_modules/.pnpm/` but pnpm's strict layout means `injectManifest` source cannot
   import them without direct entries:

   ```
   workbox-precaching  workbox-routing  workbox-strategies
   workbox-expiration  workbox-cacheable-response  workbox-core
   ```
   All at `^7.4.1` to match the version `vite-plugin-pwa` already resolves.

3. Rewrite the plugin config in `vite.config.ts`:

   ```ts
   SvelteKitPWA({
     srcDir: './src',
     strategies: 'injectManifest',
     filename: 'sw.ts',
     injectRegister: false,        // we register explicitly in pwa.svelte.ts
     registerType: 'autoUpdate',   // see Phase 10 for the migration caveat
     manifest: { /* unchanged */ },
     injectManifest: {
       globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,html}'],
       globIgnores: ['client/**/*.map'],
       maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
       additionalManifestEntries: [{ url: '/', revision: BUILD_ID }]  // Phase 2
     },
     devOptions: { enabled: true, type: 'module', navigateFallback: '/' }
   })
   ```

   **Remove `mode: 'development'`** (F3) and the now-ignored `workbox: {}` block.

4. `src/sw.ts` skeleton:

   ```ts
   /// <reference lib="webworker" />
   import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL }
     from 'workbox-precaching';
   import { NavigationRoute, registerRoute } from 'workbox-routing';
   import { NetworkOnly } from 'workbox-strategies';

   declare const self: ServiceWorkerGlobalScope;

   precacheAndRoute(self.__WB_MANIFEST);
   cleanupOutdatedCaches();

   // '/' is a real precached document as of Phase 2
   registerRoute(new NavigationRoute(createHandlerBoundToURL('/'), {
     denylist: [/^\/api\//]
   }));

   // API traffic must never be served from cache
   registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

   // + push, notificationclick, pushsubscriptionchange, sync, message  (Phases 6–7)
   ```

5. Port the existing `push` and `notificationclick` handlers from the deleted
   `src/service-worker.ts` verbatim. They are correct — they were just living in the wrong
   file.

6. In `src/lib/stores/pwa.svelte.ts`, **delete the `register('/sw.js').catch(() => register('/service-worker.js'))`
   fallback chain.** It swallowed the real error and hid F2 for the entire life of the
   project. Registration failure should surface in the console.

> **Migration note:** existing installs are running the old registration at scope `/`.
> Registering `/sw.js` at the same scope replaces the script in the *same* registration, so
> users are picked up automatically — but ship this one release with `registerType: 'autoUpdate'`
> (plus `skipWaiting` + `clientsClaim`) so nobody is stranded on the broken SW waiting for a
> prompt they will never see. Switch to `'prompt'` in the release *after* this one.

---

## Phase 2 — Prerendered SPA shell

**Effort: ~half a day. This is the highest-risk phase; verify it on every release.**

Add `src/routes/+layout.ts`:

```ts
export const prerender = true;
export const ssr = false;
```

Nothing is lost — the root page renders a loading splash until `profileStore.init()` reads
IndexedDB, so SSR was producing no useful markup anyway. `/api/*` routes are server
endpoints and are unaffected.

**The wrinkle:** with `adapter-node`, prerendered pages land in `build/prerendered/pages/index.html`,
**not** `build/client/`. Workbox globs the client output directory, so it will never see the
shell. Hence `additionalManifestEntries: [{ url: '/', revision: BUILD_ID }]` in Phase 1 —
the SW fetches `/` at install time (adapter-node's `handler.js` serves the prerendered HTML
ahead of SSR) and precaches it under that revision.

**`BUILD_ID` must change on every deploy** or clients will pin a stale shell forever. Derive
it from the existing `pkg.version` plus a build timestamp or git SHA:

```ts
const BUILD_ID = `${pkg.version}-${process.env.GIT_SHA ?? Date.now()}`;
```

This is the one thing in the whole plan that fails *silently and permanently* if you get it
wrong. Test #2 and #3 below exist specifically to catch it.

> **Accepted trade-off:** `ssr = false` is global, so any future server-rendered route needs
> its own opt-in. Given the zero-knowledge architecture, no such route is likely.

---

## Phase 3 — Self-host the fonts

**Effort: ~1 hour.**

Remove the `<link rel="preconnect">` and Google Fonts `<link>` from `src/app.html`. Add
`@fontsource-variable/playfair-display` and `@fontsource-variable/plus-jakarta-sans` and
import them from `src/app.css`.

The `.woff2` files then land in the client output and are picked up by the **existing**
`globPatterns` (`woff2` is already listed) — fully precached, deterministic, no runtime
caching rules needed. It also removes two third-party connections from a privacy-first app.

*Alternative if the CDN must stay:* a `CacheFirst` runtime route on `fonts.gstatic.com` with
a one-year `ExpirationPlugin`. Rejected — it only works after a first successful online load,
and it keeps leaking the user's IP to Google.

---

## Phase 4 — Sync protocol: schema and endpoint

**Effort: ~1 day.**

### Schema

```prisma
model PushSubscription {
  // ... existing fields unchanged ...
  clientUpdatedAt String @default("1970-01-01T00:00:00.000Z")  // ISO-8601, client clock
}
```

Guard every write: apply only if `op.clientUpdatedAt >= row.clientUpdatedAt`. ISO-8601
string comparison is lexicographic, so no parsing is needed. This stops a mutation queued
on a phone three days ago from clobbering a newer change made on a laptop yesterday when the
phone finally reconnects.

> ⚠️ **`AGENTS.md` Invariant 1 enumerates the exact permitted column set and must be amended
> in the same PR.** `clientUpdatedAt` is a timestamp, not personal data, so the privacy
> invariant itself is intact — but the documented allowlist has to stay accurate or the next
> agent will flag it as a violation.
>
> *Caveat:* last-write-wins on a client clock. A device with a badly wrong clock can win or
> lose incorrectly. Worst case is milestone notifications being off for one cycle, which is
> an acceptable failure mode here.

### Endpoint

New `POST /api/push/sync`, accepting a batch so one flush is one request:

```ts
type SyncOp =
  | { opId: string; kind: 'upsert'; clientUpdatedAt: string;
      endpoint: string; keys: { p256dh: string; auth: string };
      togetherSince: string; timezone: string; oldEndpoint?: string }
  | { opId: string; kind: 'delete'; clientUpdatedAt: string; endpoint: string };

// POST body: { ops: SyncOp[] }
// 200 response: { results: Array<{ opId: string; status: 'applied' | 'stale' | 'error' }> }
```

**No server-side dedup table is needed.** Upsert keyed on the unique `endpoint` is
idempotent by construction, and delete is idempotent. `opId` exists only for client-side
coalescing and log correlation.

Keep `/api/push/subscribe` and `/api/push/unsubscribe` as thin wrappers over the same
handler so clients running a cached older bundle keep working through the transition.

**`oldEndpoint` handling:** when present, migrate the existing row's endpoint and keys in a
single transaction rather than delete-then-create, **preserving `lastNotified`** — otherwise
an endpoint rotation on a milestone day sends the user a duplicate notification.

---

## Phase 5 — The client outbox

**Effort: ~1 day.**

New `src/lib/storage/outbox.ts`, backed by a dedicated `idb-keyval` store so it is isolated
from the profile store:

```ts
import { createStore } from 'idb-keyval';
const outboxStore = createStore('openlove-sync', 'outbox');

export async function enqueue(op: SyncOp): Promise<void>
export async function listOps(): Promise<SyncOp[]>
export async function removeOps(opIds: string[]): Promise<void>
export function coalesce(ops: SyncOp[]): SyncOp[]
```

> **Hard constraint:** `outbox.ts` must have **zero DOM and zero Svelte imports.** It is
> imported by both the window and the service worker. Note that today
> `src/lib/push/client.ts` imports `profileStore`, which touches `document` — the SW can
> never import that module. Keep the boundary clean.

**Coalescing** runs before every flush:

- Only the newest `upsert` per `endpoint` survives.
- A `delete` supersedes every earlier op for the same `endpoint`.

Without this, nudging the date picker forty times offline becomes forty requests on
reconnect.

**A `sync-meta` key** in the same store holds `{ vapidPublicKey, endpoint, togetherSince, timezone }`,
written by the window on every successful sync. The SW needs these to handle
`pushsubscriptionchange` without access to `profileStore` (Phase 7).

### The mutation funnel

Every DB-relevant mutation goes through one place — new `src/lib/sync/index.ts`:

```ts
export async function queueSubscriptionSync(reason: 'profile-change' | 'subscribe' | 'resubscribe')
export async function queueSubscriptionDelete()
export async function flushOutbox(): Promise<{ flushed: number; failed: number }>
```

Then hook `profileStore.update()`: whenever `togetherSince` changes **and**
`profile.pushSubscribed === true`, call `queueSubscriptionSync('profile-change')`.

**One hook fixes F5 across all three call sites** — settings, onboarding, and QR import all
already funnel through `update()`.

Additionally, on every app start, compare `Intl.DateTimeFormat().resolvedOptions().timeZone`
against the stored value and enqueue on drift. That closes the travel case.

---

## Phase 6 — Flush triggers, per platform

**Effort: ~1 day.** This is where "on all platforms" is actually earned.

| Trigger | Chrome/Edge Android | Chrome/Edge Desktop | Firefox | iOS / iPadOS Safari |
| :-- | :--: | :--: | :--: | :--: |
| App start / hydration | ✅ | ✅ | ✅ | ✅ |
| `window` `online` event | ✅ | ✅ | ✅ | ✅ |
| `visibilitychange` → visible | ✅ | ✅ | ✅ | ✅ |
| Background Sync (`sync`) | ✅ | ✅ | ❌ | ❌ |
| Periodic Background Sync | ✅ *(installed)* | ✅ *(installed)* | ❌ | ❌ |
| Opportunistic flush on `push` | ✅ | ✅ | ✅ | ✅ *(installed PWA)* |

**Design rule: Background Sync is a progressive enhancement, never the mechanism.** Neither
Safari nor Firefox supports it. The four foreground triggers are the baseline that makes
this work everywhere; `sync` and `periodicsync` are registered opportunistically inside
feature checks and simply improve latency where they exist.

**Do not use `workbox-background-sync`.** Its queue lives in its own opaque IndexedDB store
that the window cannot inspect, which makes both the coalescing rules and the "N changes
pending" UI impossible. A hand-rolled queue over the shared store is a few dozen lines and
gives full control.

**Treat `navigator.onLine` as a hint only** — it reports `true` on captive portals. The
authoritative signal is whether the `fetch` succeeded. Flushes are cheap and idempotent, so
just attempt them and let failures re-queue.

**Backoff:** exponential with jitter, capped at ~5 minutes, reset on any success. Ops carry
an `attempts` counter; a `4xx` other than `408`/`429` is permanent — drop the op and log,
rather than retrying forever.

---

## Phase 7 — Endpoint rotation

**Effort: ~half a day.**

In `src/sw.ts`:

```ts
self.addEventListener('pushsubscriptionchange', (event: any) => {
  event.waitUntil((async () => {
    const meta = await getSyncMeta();
    const fresh = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(meta.vapidPublicKey)
    });
    await enqueue(buildUpsert(fresh, meta, { oldEndpoint: event.oldSubscription?.endpoint }));
    await flushOutbox();
  })());
});
```

**Safari does not fire `pushsubscriptionchange`.** The cross-platform safety net is
app-start reconciliation: compare `registration.pushManager.getSubscription()?.endpoint`
against `syncMeta.endpoint` on every launch and enqueue an upsert with `oldEndpoint` when
they differ. Cheap, and it covers every browser.

---

## Phase 8 — Make local storage durable

**Effort: ~2 hours. Small change, largest downside risk avoided.**

```ts
if (navigator.storage?.persist) {
  if (!(await navigator.storage.persisted())) {
    await navigator.storage.persist();
  }
}
```

Call it right after onboarding completes — Chrome weighs engagement signals, so requesting
after a real user gesture materially improves the odds of a silent grant.

Additionally:

- Surface `navigator.storage.estimate()` in Settings so users can see their data is there.
- **iOS 17+ exempts installed PWAs from the 7-day eviction; browser tabs are not exempt.**
  The existing `PartnerInviteModal` install nudge should therefore be framed as data safety,
  not just convenience — and the app should prompt iOS browser-tab users to install.
- Add a periodic "export a backup" nudge in Settings. `exportJSON()` already exists; it just
  needs to be surfaced at the right moment.

---

## Phase 9 — Offline UX

**Effort: ~1 day.**

New `src/lib/stores/network.svelte.ts` — `isOnline` state driven by `online`/`offline`
events, plus `pendingSyncCount` derived from the outbox.

- A slim pill/banner in both themes: *"Offline — changes saved on this device"* /
  *"Syncing…"* / *"N changes pending"*. Both `ModernTheme` and `TraditionalTheme` need it,
  styled to their own idiom.
- Settings: disable **Send test notification** while offline — it is inherently online-only.

**Push subscribe must be re-modelled as an intent.** `pushManager.subscribe()` needs to reach
the push service, so it genuinely cannot complete offline. Add a local-only `pushIntent:
boolean` to `CoupleProfile` (never sent to the server). Toggling push on while offline sets
the intent and shows *"will activate when you're back online"*; each flush retries the real
subscribe; `pushSubscribed` only flips true once the server round-trip succeeds.

**Fix the unsubscribe ordering (F6):** enqueue the server `delete` op **first**, then call
`subscription.unsubscribe()`. Today it is backwards and orphans server rows.

---

## Phase 10 — Update flow

**Effort: ~half a day.**

With `injectRegister: false`, register through `virtual:pwa-register` and wire
`onNeedRefresh` / `onOfflineReady` to a small toast component — replacing the hand-rolled
registration in `pwa.svelte.ts`.

Ship the **migration release** with `registerType: 'autoUpdate'` so every existing install
lands on the fixed SW without user action, then switch to `'prompt'` in the following
release once the fleet is healthy.

Also surface `onOfflineReady` once, the first time precaching completes — it is the moment
the README's claim finally becomes true, and users should see it.

---

## Verification

Run against `pnpm build && pnpm preview`, not `pnpm dev`.

1. **One SW.** DevTools → Application → Service Workers: exactly one registration, scope `/`,
   script `/sw.js`. No `/service-worker.js` anywhere.
2. **Precache is populated.** Application → Cache Storage → `workbox-precache-v2` contains
   `/`, every `_app/immutable/*` asset, and both `.woff2` files. *(Today this cache does not
   exist at all — this is the direct test for F2.)*
3. **Cold offline start.** Network → Offline → hard reload. App renders with the real fonts,
   the live counter ticks, Settings opens. Repeat after a full browser restart.
4. **Offline mutation syncs.** Offline, change the anniversary date → banner shows 1 pending
   → go online → exactly one `POST /api/push/sync` →
   `sqlite3 data/openlove.db 'select togetherSince, clientUpdatedAt from PushSubscription'`
   shows the new value. **This test fails on `main` today, online or offline (F5).**
5. **Coalescing.** Offline, change the date five times → reconnect → still exactly one
   request carrying one op.
6. **Last-write-wins.** Queue an older change on device A while offline; make a newer change
   on device B online; bring A online. Server keeps B's value, response reports `stale`.
7. **iOS end-to-end.** Installed PWA on a real iPhone in airplane mode: force-quit, reopen →
   loads. Make a change, re-enable network, reopen → flushed. *(No Background Sync on iOS —
   this validates the foreground path.)*
8. **Background Sync.** DevTools → Application → Background Sync → trigger `openlove-sync`
   with the tab closed.
9. **Push still works.** Subscribe, `POST /api/push/test`, notification appears — proving one
   SW does both caching and push, which has never been true before.
10. **Endpoint rotation.** DevTools → Application → Push Messaging, or manually unsubscribe
    and re-subscribe; confirm the server row migrates and `lastNotified` is preserved.
11. Lighthouse PWA / installability audit passes.

---

## Files touched

| File | Change |
| :-- | :-- |
| `src/service-worker.ts` | **Deleted** — replaced by `src/sw.ts` |
| `src/sw.ts` | **New** — single SW: precache, nav fallback, push, sync |
| `src/routes/+layout.ts` | **New** — `prerender = true`, `ssr = false` |
| `src/lib/storage/outbox.ts` | **New** — outbox queue + coalescing + `sync-meta` |
| `src/lib/sync/index.ts` | **New** — queue/flush API, backoff, triggers |
| `src/lib/stores/network.svelte.ts` | **New** — online state + pending count |
| `src/routes/api/push/sync/+server.ts` | **New** — batch sync endpoint |
| `vite.config.ts` | `injectManifest`, drop `mode: 'development'`, `BUILD_ID` |
| `src/app.html` | Remove Google Fonts links |
| `src/app.css` | Import self-hosted fontsource faces |
| `prisma/schema.prisma` | Add `clientUpdatedAt` |
| `src/lib/push/client.ts` | Route through outbox; fix unsubscribe ordering |
| `src/lib/stores/profile.svelte.ts` | Hook `update()` → `queueSubscriptionSync` |
| `src/lib/stores/pwa.svelte.ts` | Remove silent registration fallback; `persist()` |
| `src/lib/types/profile.ts` | Add local-only `pushIntent` |
| `src/lib/components/settings/SettingsSheet.svelte` | Offline states, storage estimate, backup nudge |
| `src/lib/components/themes/*.svelte` | Offline / sync-pending indicator |
| `src/routes/api/push/{subscribe,unsubscribe}/+server.ts` | Thin wrappers over sync handler |
| `AGENTS.md` | Amend Invariant 1 column list; document the SW architecture |
| `README.md` | The offline claim becomes true — make it specific |

---

## Risk register

| Risk | Severity | Mitigation |
| :-- | :-- | :-- |
| `BUILD_ID` doesn't change per deploy → clients pin a stale shell permanently | **High** | Derive from git SHA in CI; verification #2 and #3 on every release |
| `ssr = false` is global, blocking future SSR routes | Low | Accepted; zero-knowledge design makes SSR routes unlikely |
| Client-clock LWW picks wrong winner | Low | Worst case is one wrong notification cycle; documented |
| Existing installs stranded on the broken SW | Medium | Ship migration release with `autoUpdate` + `skipWaiting`/`clientsClaim` |
| `AGENTS.md` Invariant 1 not updated with `clientUpdatedAt` | Medium | Same PR as the schema migration |
| SW accidentally imports DOM-touching modules and fails to build | Medium | Keep `outbox.ts` dependency-free; add a lint rule or build check |
| Precaching bloats storage on constrained devices | Low | `maximumFileSizeToCacheInBytes` cap; `cleanupOutdatedCaches()` |

---

## Suggested sequencing

**Milestone A — "offline actually works"** (Phases 1, 2, 3 · ~2 days)
Ship-able on its own. Makes the README claim true and un-breaks push at the same time.

**Milestone B — "changes reach the database"** (Phases 4, 5, 6 · ~3 days)
Fixes F5, which is a live production bug today independent of offline support.

**Milestone C — "durable and legible"** (Phases 7, 8, 9, 10 · ~2 days)
Endpoint rotation, storage persistence, offline UI, update prompts.

Milestone B is independently valuable and could be pulled forward if the wrong-anniversary-date
bug is affecting real users right now.

---

# Implementation notes — as built

> Status: **implemented**, 2026-08-26. All ten phases landed. Four things worked out
> differently from the plan once the toolchain was read rather than inferred; each is
> recorded here with the evidence, because in every case the plan's version would have
> broken the build or added risk that turned out to be unnecessary.

## D1 · The SW source stays at `src/service-worker.ts`, and `/` stays the same URL

The plan called for deleting `src/service-worker.ts` and creating `src/sw.ts`. That would
not build. `@vite-pwa/sveltekit` does **not** compile the service worker itself under
`strategies: 'injectManifest'` — it expects SvelteKit to have already compiled one, then
injects the manifest into it:

```js
// node_modules/@vite-pwa/sveltekit/dist/index.mjs
swSrc: join(clientOutputDir, 'service-worker.js'),
swDest: join(clientOutputDir, 'service-worker.js'),
```

SvelteKit compiles `kit.files.serviceWorker` (default `src/service-worker`). Deleting it
leaves nothing to inject into and `workbox-build` throws `swSrc file can't be read`.

So the source stays where SvelteKit expects it and the config sets
`filename: 'service-worker.ts'` — the `.ts` extension is what makes `resolveSwPaths()`
find the TS source in dev, while `useFilename` rewrites the emitted file and the
registration URL back to `service-worker.js`.

Keeping the **output URL** at `/service-worker.js` is also strictly safer than moving to
`/sw.js`. The currently-controlling worker on every existing install is
`/service-worker.js` (registration of `/sw.js` always rejected — F2). Publishing to the
same URL replaces the script inside the *existing* registration, so the migration is
automatic. **This removes the "existing installs stranded" risk from the register
entirely**, independently of `autoUpdate`.

The actual root of F1 was neither file's name: it was `kit.serviceWorker.register`
defaulting to `true`, which made SvelteKit inject its own registration alongside the
plugin's. That is now `false` in `svelte.config.js`, with `injectRegister: false`
alongside it, leaving exactly one registration.

## D2 · No `BUILD_ID`. `/` is precached with a content hash

The plan's highest-severity risk — *"`BUILD_ID` doesn't change per deploy → clients pin a
stale shell permanently"* — does not exist, and neither does the
`additionalManifestEntries` workaround it required.

The premise was that Workbox globs `build/client/`, where prerendered pages never land.
It doesn't. The plugin sets `globDirectory` to `.svelte-kit/output`, which is *before*
the adapter copies anything, and its manifest transform already understands prerendered
output:

```js
config.globDirectory = `${outDir}/output`;
// ...
else if (url.startsWith('prerendered/pages/')) url = url.slice(18);
if (url === 'index.html') url = base;   // -> '/'
```

Ordering works out too: SvelteKit prerenders inside the SSR build's `writeBundle`, and
the plugin injects in `closeBundle`, which Rollup always runs later.

So `globPatterns: ['prerendered/**/*.html']` is enough, and the emitted entry is
`{"revision":"9ede027b…","url":"/"}` — an MD5 of the actual shell. It cannot go stale,
and nothing has to be threaded through CI.

## D3 · `workbox-window` also needs to be a direct dependency

The plan lists six `workbox-*` packages to add for the SW source. There is a seventh:
`virtual:pwa-register` does `await import('workbox-window')`, and under pnpm's strict
layout that is unresolvable unless declared directly.

This one is worth flagging because of **how it fails**. The SSR build dies, but the error
you see is:

```
[vite-plugin-pwa:sveltekit:build] The 'swSrc' file can't be read. ENOENT: ...
```

The plugin's `closeBundle` runs in a `finally` and its own failure masks the real one.
Anyone debugging that message should assume the actual error is upstream. It is now
recorded in AGENTS.md Invariant 7.

## D4 · Google Fonts were loaded from *two* places

The plan located them in `src/app.html`. There was a second `@import url(...)` at the top
of `src/app.css`, and a third problem underneath: `html, body` hardcoded
`font-family: 'Plus Jakarta Sans', …`, duplicating the `@theme` token. Swapping in the
`@fontsource-variable` faces (which register as `'Plus Jakarta Sans Variable'`) would have
left the body on a font that is never loaded. `html, body` now reads `var(--font-sans)`,
so there is one source of truth.

---

## Additions beyond the plan

**`scripts/verify-precache.js`, wired into `pnpm build`.** The original bug's defining
property was silence — nothing in the build output said anything was wrong. The build now
asserts what it actually shipped: `/` and `manifest.webmanifest` are precached, app assets
and `.woff2` files are present, the SW does not precache itself, and the SW bundle
contains no DOM references. It fails the build otherwise. (Verified by deleting the `/`
entry from a built worker: exit 1 with a diagnostic naming `+layout.ts`.)

**The navigation route is guarded.** `createHandlerBoundToURL('/')` is wrapped in a
`try/catch` that logs loudly. A missing shell should cost offline navigation, not take
push notifications down with it — the exact failure that made this whole plan necessary.

**`profileStore.ready`.** `initSync()` awaits it before reconciling. `profile` holds
`DEFAULT_PROFILE` until IndexedDB is read, and its `togetherSince` is *today* — syncing
that on start-up would have overwritten every user's real anniversary date on first launch.

**`serviceWorker.ready` is timeout-raced.** It never settles if registration fails, which
would have hung start-up reconciliation forever and meant the outbox never flushed at all.

**`pushSubscribed` is promoted by an `onFlush` observer**, not optimistically at
subscribe time, so "Device Connected" is never shown for a device the server has not
acknowledged.

**Coalescing handles rotation.** Beyond the plan's two rules, an op whose endpoint a
surviving upsert is migrating away from (`oldEndpoint`) is dropped, and `oldEndpoint` is
carried forward when a newer upsert omits it — otherwise coalescing could either resurrect
a rotated-away row or silently discard a pending migration.

---

## Verification performed

Server-side sync semantics were exercised against a real `node build/index.js` + SQLite:
create, newer-wins, stale-rejected, rotation-preserves-`lastNotified`, rotation-replayed
(idempotent), stale-delete-rejected, delete-then-delete (idempotent), four malformed-op
rejections (400), and both legacy wrappers. Coalescing has an eight-case suite covering
the 40-nudges collapse, delete precedence, re-subscribe-after-delete, endpoint isolation,
migration carry-forward, rotated-away drop, and the attempts counter.

`pnpm check` is clean (0 errors, 4216 files). `pnpm build` passes the precache guard with
38 entries. Confirmed served: one worker at `/service-worker.js`, `/sw.js` and
`/registerSW.js` both 404, zero references to `fonts.googleapis.com` / `fonts.gstatic.com`.

**Not yet performed — needs real devices/browsers:** verification items 3 (cold offline
start after a browser restart), 7 (iOS installed-PWA airplane mode), 8 (Background Sync
with the tab closed), 9 (push end-to-end with real VAPID delivery), 10 (endpoint rotation
in a live browser), and 11 (Lighthouse).

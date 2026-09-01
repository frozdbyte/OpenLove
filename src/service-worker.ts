/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * OpenLove — the one and only service worker.
 *
 * It is compiled by SvelteKit from this file, then `@vite-pwa/sveltekit` injects
 * the Workbox precache manifest into it and emits it as `/service-worker.js`.
 * SvelteKit's own auto-registration is disabled in `svelte.config.js`; the single
 * registration lives in `src/lib/components/pwa/PWAToast.svelte`.
 *
 * Keeping precaching, push and sync in one script is deliberate: only one service
 * worker can control scope `/`, so splitting them meant offline caching XOR push
 * notifications — never both.
 */

import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
	type PrecacheEntry
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

import { SYNC_TAG, buildUpsert, flushOutbox, resolveTimezone } from '$lib/sync/core';
import { enqueue, getSyncMeta, setSyncMeta } from '$lib/storage/outbox';
import { urlBase64ToUint8Array } from '$lib/utils/base64';

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: Array<PrecacheEntry | string>;
};

/* -------------------------------------------------------------------------- */
/* Precaching                                                                 */
/* -------------------------------------------------------------------------- */

const manifest = self.__WB_MANIFEST;

/**
 * In `vite dev` this manifest is a single degenerate entry, `[{ url: '/' }]` — there is
 * no bundle to precache, because the dev server compiles every module on demand. The
 * shell will be served from cache offline and then white-screen the moment it tries to
 * fetch `/@vite/client` and friends.
 *
 * That is not a bug and it is not fixable in dev. Offline must be verified against
 * `pnpm build` + a real server run. Saying so here is cheaper than losing an hour to it.
 */
if (manifest.length <= 1) {
	console.warn(
		'[sw] dev build: only %d precache entr%s. Offline WILL NOT work under `vite dev` — ' +
			'the dev server serves modules on demand and none of them are cached. ' +
			'Verify offline with `pnpm build` and `node build/index.js`.',
		manifest.length,
		manifest.length === 1 ? 'y' : 'ies'
	);
}

precacheAndRoute(manifest);
cleanupOutdatedCaches();

/**
 * `/` is the prerendered SPA shell (see `src/routes/+layout.ts`).
 *
 * This is guarded rather than called bare because an unguarded
 * `createHandlerBoundToURL('/')` throwing at evaluation time is precisely what
 * silently killed the previous service worker: registration rejected, and the
 * push handler went down with it. A missing shell should cost us offline
 * navigation, not notifications.
 */
try {
	registerRoute(
		new NavigationRoute(createHandlerBoundToURL('/'), {
			denylist: [/^\/api\//]
		})
	);
} catch (err) {
	console.error(
		'[sw] "/" is not in the precache manifest - offline navigation is disabled. ' +
			'Check that the root route is still prerendered.',
		err
	);
}

/** API traffic must never be served from cache. */
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

self.addEventListener('install', () => {
	// Migration release: take over immediately so nobody is stranded on the old,
	// non-caching service worker waiting for a prompt they will never see.
	self.skipWaiting();
});

clientsClaim();

import { getBondSummaryForPush } from '$lib/storage/db';

/* -------------------------------------------------------------------------- */
/* Push                                                                       */
/* -------------------------------------------------------------------------- */

self.addEventListener('push', (event) => {
	// Push wakes the worker on every platform that supports it, including installed
	// iOS PWAs - the one place Background Sync will never exist. Free flush.
	event.waitUntil(
		(async () => {
			await flushAndNotify();

			if (!event.data) return;

			let payload = {
				title: 'Milestone! ❤️',
				body: 'Today is a special milestone!',
				type: 'milestone',
				bondId: '',
				milestoneId: 'milestone',
				milestoneTitle: 'Milestone',
				milestoneType: 'years'
			};

			try {
				payload = event.data.json();
			} catch {
				payload.body = event.data.text();
			}

			let bondNames = '';
			let bondType: 'romantic' | 'friendship' = 'romantic';

			if (payload.bondId) {
				try {
					const summary = await getBondSummaryForPush(payload.bondId);
					if (summary) {
						bondType = summary.type;
						// Progressive Disclosure: only include names if the user has multiple bonds
						if (summary.totalBonds > 1 && summary.names) {
							bondNames = summary.names;
						}
					}
				} catch (err) {
					console.warn('[sw] failed to lookup bond summary from IDB:', err);
				}
			}


			let title = payload.title;
			let body = payload.body;

			if (payload.type === 'milestone') {
				const mTitle = payload.milestoneTitle || payload.title;
				if (bondType === 'friendship') {
					title =
						payload.milestoneType === 'years'
							? `Happy ${mTitle}! 🌿`
							: `${mTitle} Milestone! 🌿`;
					body = bondNames
						? `${bondNames} celebrate ${mTitle} as friends today! 🎉`
						: `Today is a special friendship milestone: ${mTitle}! 🎉`;
				} else {
					title =
						payload.milestoneType === 'years'
							? `Happy ${mTitle}! ❤️`
							: `${mTitle} Milestone! 🏆`;
					body = bondNames
						? `${bondNames} celebrate ${mTitle} together today! 🎉`
						: `Today is a special relationship milestone: ${mTitle}! 🎉`;
				}
			} else if (payload.type === 'test') {
				title = 'Open Love Connected! ❤️';
				body = 'Milestone notifications are active and ready for your special days.';
			}

			const options: NotificationOptions = {
				body,
				icon: '/icon-192.png',
				badge: '/icon-192.png',
				tag: payload.bondId
					? `${payload.bondId}:${payload.milestoneId}`
					: payload.milestoneId || 'openlove-milestone',
				renotify: true,
				data: {
					url: payload.bondId
						? payload.milestoneTitle
							? `/?bond=${payload.bondId}&celebrate=${encodeURIComponent(payload.milestoneTitle)}`
							: `/?bond=${payload.bondId}`
						: '/',
					bondId: payload.bondId,
					type: payload.type,
					milestoneTitle: payload.milestoneTitle,
					milestoneType: payload.milestoneType,
					milestoneId: payload.milestoneId
				}
			};

			await self.registration.showNotification(title, options);
		})()
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const data = event.notification.data || {};
	const bondId = data.bondId;
	const milestoneTitle = data.milestoneTitle;
	const milestoneType = data.milestoneType;
	const milestoneId = data.milestoneId;
	const targetUrl =
		data.url ||
		(bondId
			? milestoneTitle
				? `/?bond=${bondId}&celebrate=${encodeURIComponent(milestoneTitle)}`
				: `/?bond=${bondId}`
			: '/');

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientList) => {
				for (const client of clientList) {
					if (client.url && 'focus' in client) {
						if (bondId) {
							client.postMessage({
								type: 'OPENLOVE_SWITCH_BOND',
								bondId,
								celebrate: milestoneTitle,
								milestoneType,
								milestoneId
							});
						}
						return client.focus();
					}
				}
				if (self.clients.openWindow) {
					return self.clients.openWindow(targetUrl);
				}
			})
	);
});

/**
 * Push services rotate endpoints. Without this the server row becomes
 * undeliverable and the user silently stops receiving notifications.
 *
 * Safari never fires this event, so `src/lib/sync/index.ts` also reconciles the
 * live endpoint against `sync-meta` on every app start. That covers every
 * browser; this handler just makes it faster where it exists.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
	const rotation = event as ExtendableEvent & {
		oldSubscription?: PushSubscription | null;
		newSubscription?: PushSubscription | null;
	};

	rotation.waitUntil(
		(async () => {
			try {
				const meta = await getSyncMeta();
				if (!meta.vapidPublicKey || (!meta.togetherSince && (!meta.bonds || meta.bonds.length === 0))) {
					console.warn('[sw] endpoint rotated but no sync-meta is stored; cannot re-subscribe');
					return;
				}

				const fresh =
					rotation.newSubscription ??
					(await self.registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: urlBase64ToUint8Array(meta.vapidPublicKey)
					}));

				const json = fresh.toJSON();
				if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

				await enqueue(
					buildUpsert({
						endpoint: json.endpoint,
						keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
						bonds: meta.bonds,
						togetherSince: meta.togetherSince,
						timezone: meta.timezone || resolveTimezone(),
						oldEndpoint: rotation.oldSubscription?.endpoint ?? meta.endpoint
					})
				);
				await setSyncMeta({ endpoint: json.endpoint });
				await flushAndNotify();
			} catch (err) {
				console.error('[sw] failed to handle pushsubscriptionchange:', err);
			}
		})()
	);
});


/* -------------------------------------------------------------------------- */
/* Outbox flush triggers                                                      */
/* -------------------------------------------------------------------------- */

self.addEventListener('sync', (event) => {
	const syncEvent = event as ExtendableEvent & { tag?: string };
	if (syncEvent.tag !== SYNC_TAG) return;
	syncEvent.waitUntil(flushAndNotify());
});

self.addEventListener('periodicsync', (event) => {
	const periodicEvent = event as ExtendableEvent & { tag?: string };
	if (periodicEvent.tag !== SYNC_TAG) return;
	periodicEvent.waitUntil(flushAndNotify());
});

self.addEventListener('message', (event) => {
	const type = (event.data as { type?: string } | undefined)?.type;
	if (type === 'SKIP_WAITING') {
		self.skipWaiting();
		return;
	}
	if (type === 'OPENLOVE_FLUSH') {
		event.waitUntil(flushAndNotify({ force: true }));
	}
});

/**
 * Flush, then tell any open window so the "N changes pending" indicator updates
 * without the page having to poll IndexedDB.
 */
async function flushAndNotify(opts: { force?: boolean } = {}): Promise<void> {
	try {
		const result = await flushOutbox(opts);
		if (result.skipped) return;

		const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		for (const client of clients) {
			client.postMessage({ type: 'OPENLOVE_SYNC_FLUSHED', result });
		}
	} catch (err) {
		console.error('[sw] outbox flush failed:', err);
	}
}

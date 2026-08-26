import {
	SYNC_TAG,
	buildUpsert,
	flushOutbox,
	onFlush,
	resolveTimezone
} from '$lib/sync/core';
import {
	countOps,
	enqueue,
	getSyncMeta,
	newOpId,
	setSyncMeta
} from '$lib/storage/outbox';
import { onProfileMutation, profileStore } from '$lib/stores/profile.svelte';
import type { SyncDeleteOp, SyncKeys } from '$lib/types/sync';

/**
 * Window side of sync: the single funnel every DB-relevant mutation goes through,
 * plus the platform flush triggers.
 *
 * This module imports `profileStore` and therefore touches `document` — it can
 * never be imported by the service worker. The SW-safe half lives in
 * `$lib/sync/core.ts` and `$lib/storage/outbox.ts`.
 */

export type SyncReason = 'profile-change' | 'subscribe' | 'resubscribe' | 'reconcile';

let initialized = false;

/* -------------------------------------------------------------------------- */
/* Queueing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `navigator.serviceWorker.ready` never settles when registration fails, so it is
 * raced against a timeout. Without that, a single failed registration would hang
 * start-up reconciliation forever and the outbox would never flush at all.
 */
const SW_READY_TIMEOUT_MS = 5000;

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
	try {
		return await Promise.race([
			navigator.serviceWorker.ready,
			new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS))
		]);
	} catch {
		return null;
	}
}

async function getLiveSubscription(): Promise<PushSubscription | null> {
	try {
		const registration = await getRegistration();
		return (await registration?.pushManager.getSubscription()) ?? null;
	} catch {
		return null;
	}
}

/**
 * Queue an upsert reflecting the current local state of this device.
 *
 * A no-op when the device has no live push subscription — there is nothing on the
 * server to keep in step, and `pushIntent` covers the "wants push but offline" case.
 */
export async function queueSubscriptionSync(
	reason: SyncReason,
	options: { subscription?: PushSubscription; oldEndpoint?: string } = {}
): Promise<boolean> {
	const subscription = options.subscription ?? (await getLiveSubscription());
	if (!subscription) return false;

	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

	const keys: SyncKeys = { p256dh: json.keys.p256dh, auth: json.keys.auth };
	const timezone = resolveTimezone();
	const togetherSince = profileStore.profile.togetherSince;
	const meta = await getSyncMeta();

	await enqueue(
		buildUpsert({
			endpoint: json.endpoint,
			keys,
			togetherSince,
			timezone,
			oldEndpoint: options.oldEndpoint
		})
	);

	// The service worker reads this to rebuild a subscription on
	// `pushsubscriptionchange` without access to `profileStore`.
	await setSyncMeta({
		endpoint: json.endpoint,
		togetherSince,
		timezone,
		vapidPublicKey: meta.vapidPublicKey
	});

	console.debug(`[sync] queued upsert (${reason})`);
	void flush();
	return true;
}

/**
 * Queue the removal of this device's server row.
 *
 * Must be called *before* `subscription.unsubscribe()`. The old code unsubscribed
 * first and then tried the network, which offline orphaned a server row pointing
 * at a dead endpoint.
 */
export async function queueSubscriptionDelete(endpoint?: string): Promise<boolean> {
	const target = endpoint ?? (await getLiveSubscription())?.endpoint ?? (await getSyncMeta()).endpoint;
	if (!target) return false;

	const op: SyncDeleteOp = {
		opId: newOpId(),
		kind: 'delete',
		clientUpdatedAt: new Date().toISOString(),
		endpoint: target,
		attempts: 0
	};
	await enqueue(op);
	void flush();
	return true;
}

/**
 * Work that must happen before every delivery attempt — currently the retry of a
 * push subscribe that could not complete offline (see `$lib/push/client.ts`).
 *
 * A registry rather than a direct import: `push/client.ts` imports this module,
 * so importing it back would be circular.
 */
type PreFlushTask = () => Promise<void>;

const preFlushTasks = new Set<PreFlushTask>();
let running = false;

export function registerPreFlushTask(task: PreFlushTask): () => void {
	preFlushTasks.add(task);
	return () => preFlushTasks.delete(task);
}

export async function flush(opts: { force?: boolean } = {}) {
	// Pre-flush tasks can themselves queue ops and call back into flush(); this
	// guard keeps that from recursing.
	if (!running) {
		running = true;
		try {
			for (const task of preFlushTasks) {
				try {
					await task();
				} catch (err) {
					console.error('[sync] pre-flush task failed:', err);
				}
			}
		} finally {
			running = false;
		}
	}
	return flushOutbox(opts);
}

export { countOps as pendingSyncCount, onFlush };

/* -------------------------------------------------------------------------- */
/* Triggers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Wire up flush triggers and the profile mutation hook. Idempotent.
 *
 * Background Sync is a progressive enhancement, never the mechanism: neither
 * Safari nor Firefox supports it. The foreground triggers below are the baseline
 * that makes this work on every platform; `sync`/`periodicsync` are registered
 * inside feature checks and only improve latency where they exist.
 */
export function initSync() {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	onProfileMutation(async (next, previous) => {
		// Only fields the server actually stores are worth a round-trip.
		if (next.togetherSince === previous.togetherSince) return;
		// `pushIntent` counts too: a subscribe that has not landed on the server yet
		// still has a queued upsert, and it must carry the newest date.
		if (!next.pushSubscribed && !next.pushIntent) return;
		await queueSubscriptionSync('profile-change');
	});

	window.addEventListener('online', () => void flush({ force: true }));

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void flush();
	});

	// App start. Reconciliation first so a rotated endpoint is queued before the
	// flush that would otherwise deliver against the stale one.
	void (async () => {
		// Never sync before IndexedDB has been read, or we would push
		// DEFAULT_PROFILE's placeholder date over the user's real one.
		await profileStore.ready;
		await reconcileOnStart();
		await flush({ force: true });
		await registerBackgroundSync();
	})();
}

/**
 * Cross-platform safety net, run on every launch:
 *
 *  - Safari never fires `pushsubscriptionchange`, so compare the live endpoint
 *    against `sync-meta` and queue a migration when they differ.
 *  - `timezone` was captured once at subscribe time and never refreshed, so a
 *    user who travels kept getting notifications on their old schedule.
 */
async function reconcileOnStart() {
	try {
		const subscription = await getLiveSubscription();
		if (!subscription) return;

		const meta = await getSyncMeta();
		const endpoint = subscription.endpoint;
		const timezone = resolveTimezone();

		const endpointRotated = !!meta.endpoint && meta.endpoint !== endpoint;
		const timezoneDrifted = meta.timezone !== timezone;
		const dateDrifted = meta.togetherSince !== profileStore.profile.togetherSince;

		if (!endpointRotated && !timezoneDrifted && !dateDrifted) return;

		await queueSubscriptionSync('reconcile', {
			subscription,
			oldEndpoint: endpointRotated ? meta.endpoint : undefined
		});
	} catch (err) {
		console.error('[sync] start-up reconciliation failed:', err);
	}
}

async function registerBackgroundSync() {
	try {
		const registration = (await getRegistration()) as
			| (ServiceWorkerRegistration & {
					sync?: { register(tag: string): Promise<void> };
					periodicSync?: { register(tag: string, opts: { minInterval: number }): Promise<void> };
			  })
			| null;
		if (!registration) return;

		if (registration.sync) {
			await registration.sync.register(SYNC_TAG);
		}

		// Installed-PWA only, and Chromium only. Purely a latency improvement.
		if (registration.periodicSync) {
			await registration.periodicSync.register(SYNC_TAG, {
				minInterval: 12 * 60 * 60 * 1000
			});
		}
	} catch {
		// Unsupported, or permission not granted. The foreground triggers stand alone.
	}
}

/** Ask the service worker to flush, e.g. right before the page is hidden. */
export function requestServiceWorkerFlush() {
	navigator.serviceWorker?.controller?.postMessage({ type: 'OPENLOVE_FLUSH' });
}

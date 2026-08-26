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
import type { SyncBondItem, SyncDeleteOp, SyncKeys } from '$lib/types/sync';
import type { AppState } from '$lib/types/bonds';

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

function extractSyncBonds(state: AppState): SyncBondItem[] {
	return state.bonds
		.filter((b) => b.notificationsEnabled)
		.map((b) => {
			const catList: string[] = [];
			if (b.milestonePrefs?.years) catList.push('years');
			if (b.milestonePrefs?.months) catList.push('months');
			if (b.milestonePrefs?.days === 'all') catList.push('days_all');
			else if (b.milestonePrefs?.days === 'major') catList.push('days_major');
			if (b.milestonePrefs?.custom) catList.push('custom');
			return {
				bondId: b.id,
				togetherSince: b.togetherSince,
				categories: catList
			};
		});
}

/**
 * Queue an upsert reflecting the current local state of this device.
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
	const bonds = extractSyncBonds(profileStore.state);
	const primaryDate = bonds[0]?.togetherSince || profileStore.profile.togetherSince;
	const meta = await getSyncMeta();

	await enqueue(
		buildUpsert({
			endpoint: json.endpoint,
			keys,
			bonds,
			togetherSince: primaryDate,
			timezone,
			oldEndpoint: options.oldEndpoint
		})
	);

	await setSyncMeta({
		endpoint: json.endpoint,
		bonds,
		togetherSince: primaryDate,
		timezone,
		vapidPublicKey: meta.vapidPublicKey
	});

	console.debug(`[sync] queued upsert (${reason}) with ${bonds.length} bond(s)`);
	void flush();
	return true;
}

/**
 * Queue the removal of this device's server row.
 */
export async function queueSubscriptionDelete(endpoint?: string): Promise<boolean> {
	const target =
		endpoint ?? (await getLiveSubscription())?.endpoint ?? (await getSyncMeta()).endpoint;
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

type PreFlushTask = () => Promise<void>;

const preFlushTasks = new Set<PreFlushTask>();
let running = false;

export function registerPreFlushTask(task: PreFlushTask): () => void {
	preFlushTasks.add(task);
	return () => preFlushTasks.delete(task);
}

export async function flush(opts: { force?: boolean } = {}) {
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

/**
 * Wire up flush triggers and the profile mutation hook.
 */
export function initSync() {
	if (initialized || typeof window === 'undefined') return;
	initialized = true;

	onProfileMutation(async (next, previous) => {
		const nextBonds = extractSyncBonds(next);
		const prevBonds = extractSyncBonds(previous);

		const bondsEqual =
			JSON.stringify(nextBonds) === JSON.stringify(prevBonds);

		if (bondsEqual) return;
		if (!next.pushSubscribed && !next.pushIntent) return;
		await queueSubscriptionSync('profile-change');
	});

	window.addEventListener('online', () => void flush({ force: true }));

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void flush();
	});

	void (async () => {
		await profileStore.ready;
		await reconcileOnStart();
		await flush({ force: true });
		await registerBackgroundSync();
	})();
}

async function reconcileOnStart() {
	try {
		const subscription = await getLiveSubscription();
		if (!subscription) return;

		const meta = await getSyncMeta();
		const endpoint = subscription.endpoint;
		const timezone = resolveTimezone();
		const currentBonds = extractSyncBonds(profileStore.state);

		const endpointRotated = !!meta.endpoint && meta.endpoint !== endpoint;
		const timezoneDrifted = meta.timezone !== timezone;
		const bondsDrifted = JSON.stringify(meta.bonds) !== JSON.stringify(currentBonds);

		if (!endpointRotated && !timezoneDrifted && !bondsDrifted) return;

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

		if (registration.periodicSync) {
			await registration.periodicSync.register(SYNC_TAG, {
				minInterval: 12 * 60 * 60 * 1000
			});
		}
	} catch {}
}

export function requestServiceWorkerFlush() {
	navigator.serviceWorker?.controller?.postMessage({ type: 'OPENLOVE_FLUSH' });
}

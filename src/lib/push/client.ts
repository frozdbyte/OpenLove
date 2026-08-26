import { getStoredPushSubId, setStoredPushSubId } from '$lib/storage/db';
import { clearSyncMeta, getSyncMeta, setSyncMeta } from '$lib/storage/outbox';
import { profileStore } from '$lib/stores/profile.svelte';
import {
	flush,
	getRegistration,
	onFlush,
	queueSubscriptionDelete,
	queueSubscriptionSync,
	registerPreFlushTask
} from '$lib/sync';
import { urlBase64ToUint8Array } from '$lib/utils/base64';

export function isPushSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission(): NotificationPermission {
	if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
	return Notification.permission;
}

/**
 * Fetch the server's VAPID public key, falling back to the copy cached in
 * `sync-meta`. The cache is what lets an offline subscribe attempt, and the
 * service worker's `pushsubscriptionchange` handler, work without the network.
 */
async function getVapidPublicKey(): Promise<string | null> {
	try {
		const res = await fetch('/api/push/vapid-public-key');
		if (res.ok) {
			const { publicKey } = await res.json();
			if (publicKey) {
				await setSyncMeta({ vapidPublicKey: publicKey });
				return publicKey;
			}
		}
	} catch {
		// Offline. Fall through to the cached key.
	}
	return (await getSyncMeta()).vapidPublicKey ?? null;
}

/**
 * Create (or reuse) this browser's push subscription.
 *
 * Returns null when the push service is unreachable — `pushManager.subscribe()`
 * has to talk to FCM/APNs/Autopush, so this genuinely cannot succeed offline.
 */
async function ensureBrowserSubscription(): Promise<PushSubscription | null> {
	const publicKey = await getVapidPublicKey();
	if (!publicKey) return null;

	// Timeout-guarded: a failed registration leaves `serviceWorker.ready` pending
	// forever, and this runs as a pre-flush task on every sync trigger.
	const registration = await getRegistration();
	if (!registration) return null;

	const convertedKey = urlBase64ToUint8Array(publicKey);
	let subscription = await registration.pushManager.getSubscription();

	if (subscription) {
		try {
			const existingRawKey = subscription.options.applicationServerKey;
			if (existingRawKey) {
				const existingKeyArray = new Uint8Array(existingRawKey);
				const isKeyMatch =
					existingKeyArray.length === convertedKey.length &&
					existingKeyArray.every((val, i) => val === convertedKey[i]);

				if (!isKeyMatch) {
					console.log('VAPID public key mismatch detected. Re-subscribing...');
					await queueSubscriptionDelete(subscription.endpoint);
					await subscription.unsubscribe();
					subscription = null;
				}
			}
		} catch (keyCheckErr) {
			console.warn('Could not verify existing subscription key:', keyCheckErr);
		}
	}

	if (!subscription) {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: convertedKey.buffer as ArrayBuffer
		});
	}

	return subscription;
}

/**
 * Subscribe this browser to Web Push.
 *
 * Modelled as an *intent*: the permission prompt and `pushManager.subscribe()`
 * need the network, so when they cannot complete we record `pushIntent` and let
 * every subsequent flush retry. `pushSubscribed` only flips true once the server
 * has actually acknowledged the subscription.
 */
export async function subscribeToPush(): Promise<{
	success: boolean;
	pending?: boolean;
	error?: string;
}> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push notifications are not supported by this browser.' };
	}

	try {
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			return { success: false, error: 'Notification permission was denied.' };
		}

		// Record the intent before anything that can fail, so a failure leaves the
		// app in a state that retries rather than one that silently gave up.
		await profileStore.update({ pushIntent: true });

		const subscription = await ensureBrowserSubscription();
		if (!subscription) {
			return {
				success: true,
				pending: true,
				error: "Saved — notifications will activate when you're back online."
			};
		}

		await queueSubscriptionSync('subscribe', { subscription });
		const result = await flush({ force: true });

		if (result.failed > 0 || result.skipped) {
			return {
				success: true,
				pending: true,
				error: "Saved — notifications will activate when you're back online."
			};
		}

		await profileStore.update({ pushSubscribed: true });
		return { success: true };
	} catch (error: any) {
		console.error('Error subscribing to push:', error);
		return { success: false, error: error.message || 'Failed to subscribe' };
	}
}

/**
 * Unsubscribe this browser from Web Push.
 *
 * Order matters: the server `delete` is enqueued *first*, then the local
 * subscription is torn down. Doing it the other way round — as this used to —
 * orphans a server row pointing at a dead endpoint whenever the network is
 * unavailable, and there is then no endpoint left to delete it by.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
	if (!isPushSupported()) return false;

	try {
		const registration = await getRegistration();
		const subscription = (await registration?.pushManager.getSubscription()) ?? null;
		const endpoint = subscription?.endpoint ?? (await getSyncMeta()).endpoint;

		if (endpoint) {
			await queueSubscriptionDelete(endpoint);
		}

		if (subscription) {
			await subscription.unsubscribe();
		}

		// Legacy id-keyed row, for devices that subscribed before endpoint-keyed sync.
		const subId = await getStoredPushSubId();
		if (subId) {
			await setStoredPushSubId(null);
		}

		await profileStore.update({ pushSubscribed: false, pushIntent: false });
		await clearSyncMeta();
		await flush({ force: true });
		return true;
	} catch (error) {
		console.error('Error unsubscribing from push:', error);
		return false;
	}
}

/**
 * Retry a subscribe that could not complete earlier. Registered as a pre-flush
 * task, so it runs on every trigger that flushes the outbox: app start, `online`,
 * `visibilitychange`, and Background Sync where it exists.
 */
export async function retryPushIntent(): Promise<void> {
	if (!isPushSupported()) return;
	if (!profileStore.profile.pushIntent) return;
	if (getPushPermission() !== 'granted') return;

	try {
		const subscription = await ensureBrowserSubscription();
		if (!subscription) return;

		// Note: `pushSubscribed` is deliberately *not* set here. The intent is only
		// fulfilled once the server has acknowledged the upsert, which is what the
		// onFlush observer in initPushRetry() below watches for.
		await queueSubscriptionSync('resubscribe', { subscription });
	} catch (err) {
		console.debug('[push] intent retry did not complete:', err);
	}
}

export function initPushRetry() {
	registerPreFlushTask(retryPushIntent);

	// Promote intent to confirmed only on a clean flush. An optimistic flip here
	// would show "Device Connected" for a device the server has never heard of.
	onFlush((result) => {
		if (!profileStore.profile.pushIntent) return;
		if (profileStore.profile.pushSubscribed) return;
		if (result.flushed === 0 || result.failed > 0) return;
		void profileStore.update({ pushSubscribed: true });
	});
}

/**
 * Send an instant test push to this device. Inherently online-only.
 */
export async function sendTestPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push not supported.' };
	}

	try {
		const registration = await getRegistration();
		const subscription = await registration?.pushManager.getSubscription();

		if (!subscription) {
			return { success: false, error: 'Device is not currently subscribed to push.' };
		}

		const subJson = subscription.toJSON();
		const res = await fetch('/api/push/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				endpoint: subJson.endpoint,
				keys: subJson.keys
			})
		});

		const data = await res.json();
		return { success: data.success, error: data.error };
	} catch (error: any) {
		console.error('Error sending test push:', error);
		return { success: false, error: error.message };
	}
}

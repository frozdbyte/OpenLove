import { getStoredPushSubId, setStoredPushSubId } from '$lib/storage/db';
import { profileStore } from '$lib/stores/profile.svelte';

/**
 * Convert a base64 string to a Uint8Array for VAPID applicationServerKey
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export function isPushSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission(): NotificationPermission {
	if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
	return Notification.permission;
}

/**
 * Subscribe the current browser to Web Push notifications.
 */
export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push notifications are not supported by this browser.' };
	}

	try {
		// 1. Request notification permission
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			return { success: false, error: 'Notification permission was denied.' };
		}

		// 2. Fetch VAPID public key
		const res = await fetch('/api/push/vapid-public-key');
		if (!res.ok) {
			throw new Error('Failed to retrieve VAPID public key from server');
		}
		const { publicKey } = await res.json();
		if (!publicKey) {
			throw new Error('Server returned empty VAPID public key');
		}

		// 3. Get Service Worker registration
		const registration = await navigator.serviceWorker.ready;

		// 4. Subscribe with PushManager
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

		// 5. Send subscription to server
		const subJson = subscription.toJSON();
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		const existingSubId = await getStoredPushSubId();

		const subRes = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				endpoint: subJson.endpoint,
				keys: subJson.keys,
				togetherSince: profileStore.profile.togetherSince,
				timezone,
				subId: existingSubId
			})
		});

		if (!subRes.ok) {
			throw new Error('Failed to register subscription on server');
		}

		const data = await subRes.json();
		if (data.id) {
			await setStoredPushSubId(data.id);
		}

		await profileStore.update({ pushSubscribed: true });
		return { success: true };
	} catch (error: any) {
		console.error('Error subscribing to push:', error);
		return { success: false, error: error.message || 'Failed to subscribe' };
	}
}

/**
 * Unsubscribe current browser from Web Push.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
	if (!isPushSupported()) return false;

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			await subscription.unsubscribe();
		}

		const subId = await getStoredPushSubId();
		if (subId) {
			await fetch('/api/push/unsubscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subId })
			});
			await setStoredPushSubId(null);
		}

		await profileStore.update({ pushSubscribed: false });
		return true;
	} catch (error) {
		console.error('Error unsubscribing from push:', error);
		return false;
	}
}

/**
 * Send an instant test push notification to this device.
 */
export async function sendTestPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push not supported.' };
	}

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

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
		return { success: data.success };
	} catch (error: any) {
		console.error('Error sending test push:', error);
		return { success: false, error: error.message };
	}
}

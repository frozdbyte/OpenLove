import webPush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';

export interface VapidKeys {
	publicKey: string;
	privateKey: string;
}

export interface PushPayload {
	title: string;
	body: string;
	type?: string;
	milestoneId?: string;
	milestoneTitle?: string;
	milestoneType?: string;
	data?: Record<string, any>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

let vapidKeys: VapidKeys | null = null;

/**
 * Initialize or retrieve VAPID keys.
 */
export function getOrCreateVapidKeys(): VapidKeys {
	if (vapidKeys) {
		return vapidKeys;
	}

	// 1. Check environment variables
	const envPub = process.env.PUBLIC_VAPID_KEY;
	const envPriv = process.env.PRIVATE_VAPID_KEY;

	if (envPub && envPriv) {
		vapidKeys = { publicKey: envPub, privateKey: envPriv };
	} else {
		// 2. Check persistent vapid.json file
		try {
			if (!fs.existsSync(DATA_DIR)) {
				fs.mkdirSync(DATA_DIR, { recursive: true });
			}

			if (fs.existsSync(VAPID_FILE)) {
				const raw = fs.readFileSync(VAPID_FILE, 'utf-8');
				vapidKeys = JSON.parse(raw);
			} else {
				// Generate new VAPID keypair
				const generated = webPush.generateVAPIDKeys();
				vapidKeys = {
					publicKey: generated.publicKey,
					privateKey: generated.privateKey
				};
				fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
			}
		} catch (error) {
			console.error('Failed to read/write vapid.json, generating ephemeral keys:', error);
			const generated = webPush.generateVAPIDKeys();
			vapidKeys = {
				publicKey: generated.publicKey,
				privateKey: generated.privateKey
			};
		}
	}

	if (!vapidKeys) {
		const generated = webPush.generateVAPIDKeys();
		vapidKeys = {
			publicKey: generated.publicKey,
			privateKey: generated.privateKey
		};
	}

	const subject = process.env.VAPID_SUBJECT || 'mailto:admin@openlove.local';
	webPush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);

	return vapidKeys;
}

/**
 * Get the public VAPID key for client subscriptions.
 */
export function getVapidPublicKey(): string {
	const keys = getOrCreateVapidKeys();
	return keys.publicKey;
}

/**
 * Send a Web Push notification to a target subscription.
 */
export async function sendPushNotification(
	subscription: { endpoint: string; p256dh: string; auth: string },
	payload: PushPayload
): Promise<{ success: boolean; shouldDelete?: boolean }> {
	getOrCreateVapidKeys();

	const pushSubscription = {
		endpoint: subscription.endpoint,
		keys: {
			p256dh: subscription.p256dh,
			auth: subscription.auth
		}
	};

	try {
		await webPush.sendNotification(
			pushSubscription,
			JSON.stringify(payload),
			{
				TTL: 60 * 60 * 24 // 24 hours
			}
		);
		return { success: true };
	} catch (error: any) {
		console.error('WebPush delivery error for endpoint:', subscription.endpoint, error.statusCode);
		// If subscription expired or gone (410 Gone / 404 Not Found), signal for cleanup
		if (error.statusCode === 410 || error.statusCode === 404) {
			return { success: false, shouldDelete: true };
		}
		return { success: false };
	}
}

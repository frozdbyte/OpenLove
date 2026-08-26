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
	bondId?: string;
	milestoneId?: string;
	milestoneTitle?: string;
	milestoneType?: string;
	data?: Record<string, any>;
}


const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

let vapidKeys: VapidKeys | null = null;

/** Valid public fallback accepted by Apple APNs, Google FCM and Mozilla Autopush. */
const FALLBACK_VAPID_SUBJECT = 'https://github.com/frozdbyte/OpenLove';

/**
 * Hostnames the push services reject. Apple's `web.push.apple.com` is the strict one:
 * it answers `403 {"reason":"BadJwtToken"}` for a subject on a non-public host, which
 * looks like a signing failure and sends you hunting in entirely the wrong place.
 */
const NON_PUBLIC_TLDS = [
	'.local',
	'.localhost',
	'.internal',
	'.intranet',
	'.lan',
	'.home',
	'.arpa',
	'.test',
	'.example',
	'.invalid'
];

function isPubliclyRoutableHost(host: string): boolean {
	const h = host.trim().toLowerCase().replace(/\.$/, '');
	if (!h) return false;
	if (h === 'localhost') return false;
	if (NON_PUBLIC_TLDS.some((tld) => h.endsWith(tld))) return false;
	// A bare hostname with no dot is not a resolvable public domain.
	if (!h.includes('.')) return false;
	// IPv4 literal.
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
	return true;
}

/** Pull the host out of `mailto:user@host` or any `http(s)://host/...` URL. */
function hostOfSubject(subject: string): string | null {
	if (subject.startsWith('mailto:')) {
		const at = subject.lastIndexOf('@');
		return at === -1 ? null : subject.slice(at + 1);
	}
	try {
		return new URL(subject).hostname;
	} catch {
		return null;
	}
}

let warnedAboutSubject = false;

/**
 * Resolve a valid VAPID subject compliant with RFC 8292 & Apple APNs (web.push.apple.com).
 *
 * Both the scheme *and* the host are validated. Checking only the scheme is how
 * `mailto:admin@openlove.local` — the kind of value a self-hoster naturally writes —
 * reaches Apple and gets every notification rejected with a misleading error.
 */
export function getVapidSubject(): string {
	if (process.env.VAPID_SUBJECT && process.env.VAPID_SUBJECT.trim()) {
		const raw = process.env.VAPID_SUBJECT.trim();
		const sub =
			raw.startsWith('mailto:') || raw.startsWith('https://') || raw.startsWith('http://')
				? raw
				: raw.includes('@')
					? `mailto:${raw}`
					: `https://${raw}`;

		const host = hostOfSubject(sub);
		if (host && isPubliclyRoutableHost(host)) {
			return sub;
		}

		if (!warnedAboutSubject) {
			warnedAboutSubject = true;
			console.warn(
				[
					`⚠️  VAPID_SUBJECT "${raw}" uses a non-public host (${host ?? 'unparseable'}).`,
					"   Apple's push service rejects these with 403 BadJwtToken and delivers nothing.",
					`   Falling back to ${FALLBACK_VAPID_SUBJECT}.`,
					'   Set VAPID_SUBJECT to a real contact you control, e.g. mailto:you@yourdomain.com',
					'   or https://your-public-domain.com. It is a contact address, not your app URL.'
				].join('\n')
			);
		}
		// Deliberately fall through to the auto-detected/fallback subject below.
	}

	// Check Coolify / SvelteKit / generic FQDN environment variables
	const fqdn =
		process.env.ORIGIN ||
		process.env.SERVICE_FQDN_OPENLOVE_3000 ||
		process.env.SERVICE_FQDN_OPENLOVE ||
		process.env.APP_URL ||
		process.env.COOLIFY_FQDN;

	if (fqdn && fqdn.trim()) {
		const clean = fqdn.trim();
		const candidate =
			clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
		const host = hostOfSubject(candidate);
		// Same guard: ORIGIN is very often http://localhost:3000 in a self-hosted setup.
		if (host && isPubliclyRoutableHost(host)) {
			return candidate;
		}
	}

	return FALLBACK_VAPID_SUBJECT;
}

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
		vapidKeys = { publicKey: envPub.trim(), privateKey: envPriv.trim() };
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

	const subject = getVapidSubject();
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
): Promise<{ success: boolean; shouldDelete?: boolean; error?: string }> {
	const keys = getOrCreateVapidKeys();
	const subject = getVapidSubject();

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
				TTL: 60 * 60 * 24, // 24 hours
				vapidDetails: {
					subject,
					publicKey: keys.publicKey,
					privateKey: keys.privateKey
				}
			}
		);
		return { success: true };
	} catch (error: any) {
		console.error(
			`WebPush delivery error for endpoint ${subscription.endpoint}:`,
			error.statusCode,
			error.body || error.message
		);
		// If subscription expired or gone (410 Gone / 404 Not Found), signal for cleanup
		if (error.statusCode === 410 || error.statusCode === 404) {
			return { success: false, shouldDelete: true, error: error.message };
		}
		return { success: false, error: error.body || error.message || `HTTP ${error.statusCode}` };
	}
}

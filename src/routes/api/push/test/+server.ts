import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { getFeatureFlags } from '$lib/server/featureFlags';
import { sendPushNotification } from '$lib/server/push';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

// Dev-only: this endpoint sends a push to whatever endpoint/keys the caller
// supplies, which would otherwise let anyone use a live deployment as an
// open relay for arbitrary Web Push messages. See PushNotificationPanel.svelte
// (client-side "Test Alert"/"Test Milestone Alert" buttons, also dev-gated).
export const POST: RequestHandler = async ({ request }) => {
	if (!dev && !getFeatureFlags().devMode) {
		error(404, 'Not found');
	}

	try {
		const body = await request.json();
		const { endpoint, keys, bondId, milestoneTitle, milestoneType } = body;

		if (!endpoint || !keys?.p256dh || !keys?.auth) {
			return json({ error: 'Missing subscription details' }, { status: 400 });
		}

		const payload = bondId
			? {
					title: 'Milestone! ❤️',
					body: 'Today is a special milestone!',
					type: 'milestone',
					bondId,
					milestoneId: 'test_milestone',
					milestoneTitle: milestoneTitle || '1 Year',
					milestoneType: milestoneType || 'years'
				}
			: {
					title: 'Open Love Connected! ❤️',
					body: 'Milestone notifications are active and ready for your special days.',
					type: 'test'
				};

		const result = await sendPushNotification(
			{
				endpoint,
				p256dh: keys.p256dh,
				auth: keys.auth
			},
			payload
		);

		return json({ success: result.success, error: result.error });

	} catch (error: any) {
		console.error('Error sending test push notification:', error);
		return json({ error: 'Failed to send test push' }, { status: 500 });
	}
};

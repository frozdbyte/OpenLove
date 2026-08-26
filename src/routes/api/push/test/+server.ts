import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;
import { sendPushNotification } from '$lib/server/push';

export const POST: RequestHandler = async ({ request }) => {
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

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendPushNotification } from '$lib/server/push';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { endpoint, keys } = body;

		if (!endpoint || !keys?.p256dh || !keys?.auth) {
			return json({ error: 'Missing subscription details' }, { status: 400 });
		}

		const result = await sendPushNotification(
			{
				endpoint,
				p256dh: keys.p256dh,
				auth: keys.auth
			},
			{
				title: 'Open Love Connected! ❤️',
				body: 'Milestone notifications are active and ready for your special days.',
				type: 'test'
			}
		);

		return json({ success: result.success, error: result.error });
	} catch (error: any) {
		console.error('Error sending test push notification:', error);
		return json({ error: 'Failed to send test push' }, { status: 500 });
	}
};

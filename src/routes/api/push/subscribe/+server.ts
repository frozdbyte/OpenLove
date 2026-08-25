import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { endpoint, keys, togetherSince, timezone, subId } = body;

		if (!endpoint || !keys?.p256dh || !keys?.auth || !togetherSince) {
			return json({ error: 'Missing required subscription fields' }, { status: 400 });
		}

		const userTimezone = timezone || 'UTC';

		// Upsert subscription
		const sub = await prisma.pushSubscription.upsert({
			where: { endpoint },
			update: {
				p256dh: keys.p256dh,
				auth: keys.auth,
				togetherSince,
				timezone: userTimezone
			},
			create: {
				id: subId || undefined,
				endpoint,
				p256dh: keys.p256dh,
				auth: keys.auth,
				togetherSince,
				timezone: userTimezone
			}
		});

		return json({ success: true, id: sub.id });
	} catch (error: any) {
		console.error('Error registering push subscription:', error);
		return json({ error: 'Failed to save push subscription' }, { status: 500 });
	}
};

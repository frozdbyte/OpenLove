import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { applySyncOps } from '$lib/server/sync';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

/**
 * Legacy single-subscription endpoint, kept as a thin wrapper over the same sync
 * handler so clients still running a cached older bundle keep working through the
 * transition. New code paths go through `POST /api/push/sync`.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { endpoint, keys, togetherSince, timezone } = body;

		if (!endpoint || !keys?.p256dh || !keys?.auth || !togetherSince) {
			return json({ error: 'Missing required subscription fields' }, { status: 400 });
		}

		// Legacy clients send no client timestamp; stamping it here means the most
		// recent request wins, which is the behaviour they already assumed.
		const [result] = await applySyncOps([
			{
				opId: `legacy-subscribe-${Date.now()}`,
				kind: 'upsert',
				clientUpdatedAt: new Date().toISOString(),
				endpoint,
				keys: { p256dh: keys.p256dh, auth: keys.auth },
				bonds: [
					{
						bondId: 'primary_bond',
						togetherSince,
						categories: ['years', 'months', 'days_all', 'custom']
					}
				],
				togetherSince,
				timezone: timezone || 'UTC'
			}
		]);


		if (result?.status === 'error') {
			return json({ error: 'Failed to save push subscription' }, { status: 500 });
		}

		const sub = await prisma.pushSubscription.findUnique({ where: { endpoint } });
		return json({ success: true, id: sub?.id });
	} catch (error: any) {
		console.error('Error registering push subscription:', error);
		return json({ error: 'Failed to save push subscription' }, { status: 500 });
	}
};

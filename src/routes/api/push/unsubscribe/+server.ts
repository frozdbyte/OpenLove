import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { endpoint, subId } = body;

		if (endpoint) {
			await prisma.pushSubscription.deleteMany({
				where: { endpoint }
			});
		} else if (subId) {
			await prisma.pushSubscription.deleteMany({
				where: { id: subId }
			});
		}

		return json({ success: true });
	} catch (error: any) {
		console.error('Error unsubscribing from push:', error);
		return json({ error: 'Failed to unsubscribe' }, { status: 500 });
	}
};

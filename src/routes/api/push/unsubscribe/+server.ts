import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { applySyncOps } from '$lib/server/sync';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

/**
 * Legacy unsubscribe endpoint, kept as a thin wrapper over the same sync handler
 * for clients still running a cached older bundle. New code paths enqueue a
 * `delete` op and go through `POST /api/push/sync`.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { endpoint, subId } = body;

		if (endpoint) {
			await applySyncOps([
				{
					opId: `legacy-unsubscribe-${Date.now()}`,
					kind: 'delete',
					clientUpdatedAt: new Date().toISOString(),
					endpoint
				}
			]);
			return json({ success: true });
		}

		if (subId) {
			// Id-only deletes predate endpoint-keyed sync and carry no client clock,
			// so there is nothing to guard against here.
			await prisma.pushSubscription.deleteMany({ where: { id: subId } });
		}

		return json({ success: true });
	} catch (error: any) {
		console.error('Error unsubscribing from push:', error);
		return json({ error: 'Failed to unsubscribe' }, { status: 500 });
	}
};

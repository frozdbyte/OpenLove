import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;
import { getVapidPublicKey } from '$lib/server/push';

export const GET: RequestHandler = async () => {
	try {
		const publicKey = getVapidPublicKey();
		return json({ publicKey });
	} catch (error: any) {
		console.error('Error fetching VAPID public key:', error);
		return json({ error: 'Failed to retrieve VAPID key' }, { status: 500 });
	}
};

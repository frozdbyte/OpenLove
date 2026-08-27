import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;
import { getFeatureFlags } from '$lib/server/featureFlags';
import { getSharedImage } from '$lib/server/sharedImage';

/**
 * Fetch a relayed encrypted photo. Repeatable — does not delete or
 * otherwise mutate state (unlimited loads within the TTL window; deletion
 * is exclusively `cleanupExpiredSharedImages()`'s job). 404s for a
 * nonexistent id and for one that exists but has aged past its TTL —
 * identical response either way, so a caller can't distinguish "never
 * existed" from "expired".
 */
export const GET: RequestHandler = async ({ params }) => {
	if (!getFeatureFlags().shareImages) {
		error(404, 'Not found');
	}

	try {
		const buffer = await getSharedImage(params.id);
		if (!buffer) {
			return json({ error: 'Not found or expired' }, { status: 404 });
		}
		return json({ ciphertext: buffer.toString('base64') });
	} catch (err: any) {
		console.error('Error fetching shared image:', err);
		return json({ error: 'Failed to fetch image' }, { status: 500 });
	}
};

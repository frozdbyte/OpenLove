import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;
import { getFeatureFlags } from '$lib/server/featureFlags';
import { saveSharedImage, MAX_SHARED_IMAGE_BYTES } from '$lib/server/sharedImage';

/**
 * Store a client-encrypted photo for relay to a partner via QR/link. The
 * server never sees the decryption key (it travels only in the share
 * payload) or plaintext — see AGENTS.md Invariant 11. No auth: the
 * shareId this returns is the capability, same trust model as this app's
 * other anonymous endpoints.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!getFeatureFlags().shareImages) {
		error(404, 'Not found');
	}

	try {
		const body = await request.json();
		const base64 = typeof body?.ciphertext === 'string' ? body.ciphertext : '';
		if (!base64) {
			return json({ error: 'Missing ciphertext' }, { status: 400 });
		}

		const buffer = Buffer.from(base64, 'base64');
		if (buffer.byteLength === 0) {
			return json({ error: 'Missing ciphertext' }, { status: 400 });
		}
		if (buffer.byteLength > MAX_SHARED_IMAGE_BYTES) {
			return json({ error: 'Image too large' }, { status: 413 });
		}

		const { id } = await saveSharedImage(buffer);
		return json({ shareId: id });
	} catch (err: any) {
		console.error('Error saving shared image:', err);
		return json({ error: 'Failed to save image' }, { status: 500 });
	}
};

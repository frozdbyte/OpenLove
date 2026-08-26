import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SyncRequestError, applySyncOps, parseOps } from '$lib/server/sync';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

/**
 * Batch subscription sync. One outbox flush is one request.
 *
 * Every op is idempotent and guarded by last-write-wins, so the client is free to
 * retry the whole batch after any failure.
 */
export const POST: RequestHandler = async ({ request }) => {
	let ops;
	try {
		ops = parseOps(await request.json());
	} catch (error: any) {
		if (error instanceof SyncRequestError) {
			// A 4xx tells the client this payload will never be accepted, so it drops
			// the ops instead of retrying them forever.
			return json({ error: error.message }, { status: 400 });
		}
		return json({ error: 'Malformed JSON body' }, { status: 400 });
	}

	try {
		return json({ results: await applySyncOps(ops) });
	} catch (error: any) {
		console.error('Error applying push sync batch:', error);
		return json({ error: 'Failed to apply sync ops' }, { status: 500 });
	}
};

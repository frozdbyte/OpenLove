import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;
import { getFeatureFlags } from '$lib/server/featureFlags';

// Resolved fresh from `process.env` on every request (see getFeatureFlags's
// doc comment) — the root route's ssr=false prerendered shell means neither
// $env/static/public nor a server load function can reflect an env var set
// at container start, so the client fetches this instead. Mirrors
// vapid-public-key/+server.ts.
export const GET: RequestHandler = async () => {
	try {
		return json(getFeatureFlags());
	} catch (error: any) {
		console.error('Error resolving feature flags:', error);
		return json({ error: 'Failed to resolve feature flags' }, { status: 500 });
	}
};

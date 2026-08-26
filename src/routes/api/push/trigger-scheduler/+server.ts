import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAndDispatchMilestones } from '$lib/server/scheduler';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

export const POST: RequestHandler = async () => {
	try {
		const result = await checkAndDispatchMilestones();
		return json({ success: true, ...result });
	} catch (error: any) {
		console.error('Error manually triggering scheduler:', error);
		return json({ error: 'Failed to run scheduler', message: error.message }, { status: 500 });
	}
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAndDispatchMilestones } from '$lib/server/scheduler';
import { dev } from '$app/environment';

// The root layout sets `prerender = true`; server endpoints must opt out.
export const prerender = false;

// Dev-only: `checkAndDispatchMilestones()` evaluates and dispatches to every
// subscription in the database with no auth — publicly reachable, this lets
// anyone force-send push notifications to every other user's device on demand.
// See PushNotificationPanel.svelte's dev-gated "Run Cron Check" button.
export const POST: RequestHandler = async () => {
	if (!dev) {
		error(404, 'Not found');
	}

	try {
		const result = await checkAndDispatchMilestones();
		return json({ success: true, ...result });
	} catch (error: any) {
		console.error('Error manually triggering scheduler:', error);
		return json({ error: 'Failed to run scheduler', message: error.message }, { status: 500 });
	}
};

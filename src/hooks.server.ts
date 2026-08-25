import type { Handle } from '@sveltejs/kit';
import { startMilestoneScheduler } from '$lib/server/scheduler';

// Start the background milestone scheduler on server startup
startMilestoneScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	return response;
};

import type { Handle } from '@sveltejs/kit';
import { startMilestoneScheduler, stopMilestoneScheduler } from '$lib/server/scheduler';
import { startSharedImageCleanup, stopSharedImageCleanup } from '$lib/server/sharedImage';

// Start the background milestone scheduler on server startup
startMilestoneScheduler();
startSharedImageCleanup();

/**
 * adapter-node registers its own SIGINT/SIGTERM handlers, which close the HTTP
 * server and then emit `sveltekit:shutdown` — it never calls `process.exit()`, so
 * anything still holding the event loop open keeps the process alive forever.
 * Clearing the scheduler's interval here lets the process actually exit.
 *
 * Registered once: `hooks.server.ts` can be re-evaluated on HMR in dev, and
 * re-registering would leak listeners until Node's max-listeners warning fires.
 */
const globalForShutdown = globalThis as unknown as { openloveShutdownHooked?: boolean };

if (!globalForShutdown.openloveShutdownHooked) {
	globalForShutdown.openloveShutdownHooked = true;

	(process as NodeJS.EventEmitter).on('sveltekit:shutdown', (reason: string) => {
		console.log(`\n\u{1F44B} Shutting down OpenLove (${reason})...`);
		stopMilestoneScheduler();
		stopSharedImageCleanup();
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	return response;
};

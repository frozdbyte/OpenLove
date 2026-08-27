import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * Pure-logic unit tests only (Phase 0 of REFACTOR_PLAN.md): date/milestone math,
 * outbox coalescing, and server sync conflict resolution. None of these need a
 * DOM, so this deliberately does not configure a `jsdom`/`happy-dom` environment.
 *
 * Reuses the `sveltekit()` plugin purely for `$lib` alias resolution — the same
 * aliasing `vite.config.ts` gets from it — without pulling in the PWA plugin.
 */
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts']
	}
});

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		serviceWorker: {
			// SvelteKit would otherwise auto-register `/service-worker.js` from its own client
			// bootstrap, racing the registration we do from `+layout.svelte`. One registration,
			// one script — see AGENTS.md "Service Worker Architecture".
			register: false
		},
		alias: {
			$lib: './src/lib',
			'$lib/*': './src/lib/*'
		}
	}
};

export default config;

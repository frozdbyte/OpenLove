import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			strategies: 'injectManifest',
			// Source is `src/service-worker.ts` (compiled by SvelteKit); the `.ts` extension
			// here is what makes vite-plugin-pwa resolve the TS source in dev. The emitted
			// file and the registration URL both stay `/service-worker.js`, which is the
			// script existing installs are already controlled by — so they migrate in place.
			filename: 'service-worker.ts',
			// We register explicitly from `+layout.svelte` via `virtual:pwa-register`.
			injectRegister: false,
			// Migration release: every existing install is stuck on a service worker that
			// never precached anything. `autoUpdate` + skipWaiting/clientsClaim in the SW
			// guarantees they land on the fixed one without waiting for a prompt.
			// Switch to 'prompt' in the release after this one.
			registerType: 'autoUpdate',
			manifest: {
				name: 'Open Love',
				short_name: 'Open Love',
				description: 'Self-hosted, privacy-first relationship tracker',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				// Static value: Android's WebAPK splash screen is drawn from this before any
				// JS runs, so it can't react to prefers-color-scheme like the in-page
				// <meta name="theme-color"> does. Kept dark so it doesn't flash bright
				// white on dark-mode devices; matches the maskable icon background below.
				background_color: '#151323',
				theme_color: '#e11d48',
				icons: [
					{
						purpose: 'any',
						src: '/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						purpose: 'any',
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					// Separate from the `any` icons above: Android's adaptive icon mask
					// crops aggressively, so these have the artwork padded into a safe
					// zone on an opaque background (see scripts/make-maskable-icons.js).
					// Reusing the full-bleed `any` icon here clips the heart and shows
					// a black splash background on Android.
					{
						purpose: 'maskable',
						src: '/icon-192-maskable.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						purpose: 'maskable',
						src: '/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png'
					}
				],
				handle_links: 'preferred',
				launch_handler: {
					client_mode: 'focus-existing'
				}
			},
			injectManifest: {
				// Workbox globs `.svelte-kit/output`, not `build/`. The prerendered SPA shell
				// lands in `prerendered/pages/index.html` there and the plugin's manifest
				// transform rewrites it to `/` — that is the entry `createHandlerBoundToURL('/')`
				// needs, and its revision is a content hash so it can never go stale.
				globPatterns: [
					'client/**/*.{js,css,ico,png,svg,webp,avif,woff,woff2,webmanifest}',
					'prerendered/**/*.html'
				],
				globIgnores: ['client/**/*.map', 'server/**'],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			},
			devOptions: {
				// Deliberately OFF. `vite dev` cannot precache anything useful — its manifest
				// is a single degenerate `[{ url: '/' }]` entry with no revision, because the
				// dev server compiles modules on demand. Worse, that revision-less entry is
				// treated by Workbox as immutable, so the cached dev shell (which references
				// /@fs/... and /dev-sw.js) keeps being served after you switch to a real
				// build on the same host/port, producing a wall of 404s.
				//
				// Offline behaviour must be verified against `pnpm build && pnpm start`.
				// Turn this back on only to debug service worker logic itself, and unregister
				// the dev worker before going back to a production build.
				enabled: false,
				type: 'module',
				navigateFallback: '/'
			}
		})
	],
	server: {
		fs: {
			allow: ['..']
		},
		allowedHosts: ["localhost", "localhost:5173", "sv-latitude.frozd.dev"]
	}
});

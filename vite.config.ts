import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: 'development',
			strategies: 'generateSW',
			manifest: {
				name: 'OpenLove',
				short_name: 'OpenLove',
				description: 'Self-hosted, privacy-first relationship tracker',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#fff1f2',
				theme_color: '#e11d48',
				icons: [
					{
						src: '/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: '/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				]
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			devOptions: {
				enabled: true,
				type: 'module'
			}
		})
	],
	server: {
		fs: {
			allow: ['..']
		}
	}
});

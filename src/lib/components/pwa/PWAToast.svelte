<script lang="ts">
	import { onMount } from 'svelte';
	import { CloudCheck, RefreshCw, Sparkles, X } from '@lucide/svelte';
	import Button from '$lib/components/ui/button';
	import { APP_VERSION } from '$lib/version';
	import { getJustUpdated } from '$lib/utils/version';

	/**
	 * Service worker registration and update surface.
	 *
	 * This is the *only* place the service worker is registered. SvelteKit's own
	 * auto-registration is off (`svelte.config.js`) and the plugin's injected
	 * `registerSW.js` is off (`injectRegister: false`), so there is exactly one
	 * registration at scope `/` — which is all a browser will honour anyway.
	 *
	 * This release ships `registerType: 'autoUpdate'`, so `onNeedRefresh` will not
	 * normally fire; it is wired anyway for the switch to `'prompt'` in the release
	 * after this one.
	 */

	let needRefresh = $state(false);
	let offlineReady = $state(false);
	let justUpdated = $state(false);
	let updateServiceWorker = $state<((reload?: boolean) => Promise<void>) | null>(null);

	onMount(() => {
		let dismissTimer: ReturnType<typeof setTimeout> | undefined;
		let updatedTimer: ReturnType<typeof setTimeout> | undefined;

		// Independent of service worker registration below: a version bump alone
		// (e.g. a build that didn't change any precached asset) is enough to detect.
		if (getJustUpdated()) {
			justUpdated = true;
			updatedTimer = setTimeout(() => (justUpdated = false), 4000);
		}

		// Dynamic import keeps the virtual module out of the SSR/prerender pass.
		import('virtual:pwa-register')
			.then(({ registerSW }) => {
				updateServiceWorker = registerSW({
					immediate: true,
					onNeedRefresh() {
						needRefresh = true;
					},
					onOfflineReady() {
						// The moment the README's offline claim actually becomes true.
						offlineReady = true;
						dismissTimer = setTimeout(() => (offlineReady = false), 6000);
					},
					onRegisterError(error: unknown) {
						// Loud on purpose. A swallowed error here is exactly what hid the
						// fact that nothing was ever being precached.
						console.error('Service worker registration failed:', error);
					}
				});
			})
			.catch((err) => console.error('Failed to load the PWA register module:', err));

		return () => {
			clearTimeout(dismissTimer);
			clearTimeout(updatedTimer);
		};
	});

	async function applyUpdate() {
		needRefresh = false;
		await updateServiceWorker?.(true);
	}
</script>

{#if needRefresh || offlineReady || justUpdated}
	<div
		class="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none"
		role="status"
		aria-live="polite"
	>
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md max-w-sm w-full"
		>
			{#if needRefresh}
				<RefreshCw class="h-5 w-5 shrink-0 text-primary" />
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold text-foreground">A new version is ready</p>
					<p class="text-xs text-muted-foreground">Reload to get the latest Open Love.</p>
				</div>
				<Button size="sm" class="shrink-0" onclick={applyUpdate}>Reload</Button>
			{:else if offlineReady}
				<CloudCheck class="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold text-foreground">Ready to work offline</p>
					<p class="text-xs text-muted-foreground">
						Open Love now loads with no connection at all.
					</p>
				</div>
				<button
					type="button"
					class="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
					onclick={() => (offlineReady = false)}
					aria-label="Dismiss"
				>
					<X class="h-4 w-4" />
				</button>
			{:else}
				<Sparkles class="h-5 w-5 shrink-0 text-primary" />
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold text-foreground">Updated to v{APP_VERSION}</p>
					<p class="text-xs text-muted-foreground">You're on the latest version of Open Love.</p>
				</div>
				<button
					type="button"
					class="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
					onclick={() => (justUpdated = false)}
					aria-label="Dismiss"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>
{/if}

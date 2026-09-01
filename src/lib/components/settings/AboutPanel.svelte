<script lang="ts">
	/**
	 * Static "About OpenLove" info: version, changelog, license, and links.
	 * The changelog list is parsed from the repo-root CHANGELOG.md at build
	 * time (see `$lib/utils/changelog`) — there is no second copy to keep in
	 * sync by hand.
	 */
	import { APP_VERSION } from '$lib/version';
	import { CHANGELOG } from '$lib/utils/changelog';
	import Button from '$lib/components/ui/button';
	import { Heart, Code, ScrollText, ShieldCheck, ExternalLink, RefreshCw } from '@lucide/svelte';

	const RECENT_ENTRIES = CHANGELOG.slice(0, 5);

	let isCheckingForUpdates = $state(false);

	/**
	 * Manual escape hatch for installs (mainly iOS Safari/homescreen) that get stuck
	 * on a stale service worker and never pick up `registerType: 'autoUpdate'`'s
	 * silent background update. `registration.update()` bypasses the browser's normal
	 * update throttling and forces a real network fetch of the SW script.
	 *
	 * `service-worker.ts`'s install handler calls `self.skipWaiting()` unconditionally,
	 * so a new worker (if found) activates and claims this page itself shortly after —
	 * but that handoff is async, so the reload waits (briefly, bounded) for
	 * `controllerchange` rather than racing ahead of it and reloading into whichever
	 * worker happened to still be active at that instant.
	 */
	async function checkForUpdates() {
		if (isCheckingForUpdates) return;
		isCheckingForUpdates = true;

		try {
			if ('serviceWorker' in navigator) {
				const registration = await navigator.serviceWorker.getRegistration();

				if (registration) {
					await registration.update();

					if (registration.installing || registration.waiting) {
						await new Promise<void>((resolve) => {
							const onControllerChange = () => {
								navigator.serviceWorker.removeEventListener(
									'controllerchange',
									onControllerChange
								);
								resolve();
							};
							navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
							setTimeout(() => {
								navigator.serviceWorker.removeEventListener(
									'controllerchange',
									onControllerChange
								);
								resolve();
							}, 3000);
						});
					}
				}
			}
		} catch (err) {
			console.error('Manual update check failed:', err);
		} finally {
			window.location.reload();
		}
	}
</script>

<!-- App identity -->
<section class="p-4 rounded-2xl bg-card border border-border space-y-3">
	<div class="flex items-center gap-3">
		<div class="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
			<Heart class="h-5 w-5 fill-primary/30" />
		</div>
		<div class="min-w-0">
			<div class="text-sm font-semibold text-foreground">Open Love v{APP_VERSION}</div>
			<p class="text-xs text-muted-foreground">Privacy-first & self-hosted. Made with 🩵 by Frozd.</p>
		</div>
	</div>
	<Button
		size="sm"
		variant="outline"
		class="w-full h-8 text-xs"
		disabled={isCheckingForUpdates}
		onclick={checkForUpdates}
	>
		<RefreshCw class="h-3.5 w-3.5 mr-1.5 {isCheckingForUpdates ? 'animate-spin' : ''}" />
		<span>{isCheckingForUpdates ? 'Checking…' : 'Check for Updates'}</span>
	</Button>
</section>

<!-- Privacy summary -->
<section class="p-3.5 rounded-2xl bg-card border border-border space-y-1.5">
	<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
		<ShieldCheck class="h-4 w-4 text-primary" />
		<span>Zero-Knowledge Privacy</span>
	</div>
	<p class="text-xs text-muted-foreground">
		Names, dates, and photos are stored only on this device. This server never sees them —
		it only ever holds an anonymous push token, a date, and a timezone, used to schedule
		milestone notifications.
	</p>
</section>

<!-- What's new -->
<section class="space-y-2.5">
	<div class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
		<ScrollText class="h-3.5 w-3.5" />
		<span>What's New</span>
	</div>

	<div class="space-y-3">
		{#each RECENT_ENTRIES as entry (entry.version)}
			<div class="p-3.5 rounded-2xl bg-card border border-border space-y-2">
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-sm font-semibold text-foreground">v{entry.version}</span>
					{#if entry.date}
						<span class="text-[11px] text-muted-foreground">{entry.date}</span>
					{/if}
				</div>
				{#each entry.sections as section (section.heading)}
					<div class="space-y-1">
						<div class="text-[11px] font-semibold text-muted-foreground">{section.heading}</div>
						<ul class="space-y-0.5">
							{#each section.items as item}
								<li class="text-xs text-foreground/90 pl-3 relative before:content-['-'] before:absolute before:left-0 before:text-muted-foreground">
									{item}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<a
		class="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
		href="https://github.com/frozdbyte/OpenLove/blob/main/CHANGELOG.md"
		target="_blank"
		rel="noopener noreferrer"
	>
		<span>View full changelog on GitHub</span>
		<ExternalLink class="h-3 w-3" />
	</a>
</section>

<!-- Links -->
<section class="pt-2 border-t border-border space-y-2 text-center">
	<a
		class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
		href="https://github.com/frozdbyte/OpenLove"
		target="_blank"
		rel="noopener noreferrer"
	>
		<Code class="h-3.5 w-3.5" />
		<span>View Source on GitHub</span>
	</a>
	<a
		class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
		href="https://frozdbyte.github.io/OpenLove/"
		target="_blank"
		rel="noopener noreferrer"
	>
		<ExternalLink class="h-3.5 w-3.5" />
		<span>Project Website</span>
	</a>
	<p class="text-[10px] text-muted-foreground/60 pt-1">MIT License</p>
</section>

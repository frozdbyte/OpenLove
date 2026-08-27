<script lang="ts">
	/**
	 * Step 2 of `OnboardingFlow.svelte`'s wizard: PWA install prompt (skipped
	 * entirely when already running standalone). Extracted per REFACTOR_PLAN.md,
	 * Medium M5.
	 *
	 * `installSuccess` stays a prop (rather than moving into this step) because
	 * the wizard's footer button label, rendered by the parent, also depends on
	 * it: `{installSuccess || pwaStore.isInstalled ? 'Continue' : 'Continue in
	 * Browser'}`. `showAddressBarTip` and `handleInstallPWA` stay in the parent
	 * for the same reason — `handleInstallPWA` is what sets `installSuccess`.
	 */
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button';
	import { Smartphone, Check, Share2, QrCode, Download } from '@lucide/svelte';

	interface Props {
		installSuccess: boolean;
		showAddressBarTip: boolean;
		onInstall: () => void;
		onScanQR: () => void;
	}

	let { installSuccess, showAddressBarTip, onInstall, onScanQR }: Props = $props();

	let userOS = $derived(pwaStore.userOS);
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
		<Smartphone class="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
	</div>

	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Install Open Love</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">Add to your home screen for the full app experience</p>
	</div>

	{#if installSuccess || pwaStore.isInstalled}
		<!-- Installation Success Feedback -->
		<Card class="p-4 sm:p-5 bg-emerald-500/10 border-emerald-500/30 text-center space-y-2 rounded-2xl animate-in fade-in zoom-in-95 duration-300">
			<div class="h-10 w-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
				<Check class="h-6 w-6 stroke-[3]" />
			</div>
			<div class="text-sm font-bold text-emerald-600 dark:text-emerald-400">Open Love Installed!</div>
			<p class="text-xs text-muted-foreground">
				You can now launch Open Love directly from your home screen or continue setting up right here.
			</p>
		</Card>
	{:else if userOS !== 'ios'}
		<!-- 1-Click PWA Installation Callout (Chromium on Android / Desktop) -->
		<Card class="p-4 sm:p-5 bg-card border-primary/30 shadow-md text-center space-y-3 rounded-2xl ring-1 ring-primary/15">
			<div class="space-y-1">
				<div class="text-sm font-bold text-foreground">Fast 1-Click Install</div>
				<p class="text-xs text-muted-foreground leading-relaxed">
					Install Open Love directly to your device for instant offline access, standalone view, and anniversary alerts.
				</p>
			</div>

			<Button
				type="button"
				class="w-full h-11 sm:h-12 text-sm sm:text-base font-bold shadow-md gap-2 cursor-pointer"
				size="lg"
				onclick={onInstall}
			>
				<Download class="h-5 w-5" />
				<span>Install App Now</span>
			</Button>

			{#if showAddressBarTip}
				<p class="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl text-left leading-snug">
					{#if userOS === 'android'}
						Tap the <strong class="text-foreground">three dots (⋮)</strong> in Chrome and choose <strong class="text-foreground">"Install app"</strong>.
					{:else}
						Click the <strong class="text-foreground">Install App icon (⊕)</strong> in your browser address bar to install.
					{/if}
				</p>
			{/if}
		</Card>
	{:else}
		<!-- iOS Safari Manual Installation Guide -->
		<Card class="p-3.5 sm:p-4 bg-card border-border shadow-sm text-left space-y-2.5 rounded-2xl">
			<div class="flex items-start gap-2.5">
				<div class="p-1.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
					<Share2 class="h-4 w-4" />
				</div>
				<div class="text-xs space-y-0.5">
					<div class="font-bold text-foreground">iPhone & iPad (Safari):</div>
					<p class="text-muted-foreground leading-snug">
						Tap the <strong class="text-foreground">Share</strong> icon at the bottom of Safari, then tap <strong class="text-foreground">"Add to Home Screen"</strong>.
					</p>
				</div>
			</div>
		</Card>
	{/if}

	<p class="text-[11px] text-muted-foreground">
		Installed? Open it from your home screen, or continue setup right here in your browser.
	</p>

	<div class="pt-0.5">
		<button
			type="button"
			class="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
			onclick={onScanQR}
		>
			<QrCode class="h-3.5 w-3.5" />
			<span>Sync with Partner / Scan QR</span>
		</button>
	</div>
</div>

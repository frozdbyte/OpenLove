<script lang="ts">
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Card from '$lib/components/ui/card';
	import { Heart, Smartphone, Share2, Copy, Check, Sparkles, Monitor, Download } from '@lucide/svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { pwaStore } from '$lib/stores/pwa.svelte';

	interface Props {
		open?: boolean;
		partnerNames?: string;
		importRaw?: string;
		onAcceptBrowser?: () => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		partnerNames = 'Your Partner',
		importRaw = '',
		onAcceptBrowser,
		onclose
	}: Props = $props();

	let copied = $state(false);
	let userOS = $state<'ios' | 'android' | 'desktop'>('desktop');

	$effect(() => {
		if (typeof window !== 'undefined') {
			const ua = window.navigator.userAgent.toLowerCase();
			if (/iphone|ipad|ipod/.test(ua)) {
				userOS = 'ios';
			} else if (/android/.test(ua)) {
				userOS = 'android';
			} else {
				userOS = 'desktop';
			}
		}
	});

	async function copyCode() {
		if (typeof window === 'undefined' || !importRaw) return;
		try {
			const ok = await copyToClipboard(importRaw);
			if (ok) {
				copied = true;
				setTimeout(() => {
					copied = false;
				}, 2500);
			}
		} catch (err) {
			console.error('Failed to copy sync code:', err);
		}
	}

	async function handleInstallPWA() {
		await pwaStore.promptInstall();
	}

	function handleUseInBrowser() {
		open = false;
		onAcceptBrowser?.();
	}
</script>

<Modal
	bind:open
	title="Partner Invite Received! ❤️"
	description={`Relationship counter for ${partnerNames}`}
	{onclose}
>
	<div class="space-y-4 text-left">
		<div class="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 text-foreground flex items-center gap-3">
			<div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
				<Heart class="h-5 w-5 fill-primary" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="text-xs text-muted-foreground font-medium">Ready to sync</div>
				<div class="text-sm font-bold text-foreground truncate">{partnerNames}</div>
			</div>
		</div>

		<!-- Choice 1: Add to Home Screen to Install with Preloaded Profile -->
		<Card class="p-3.5 sm:p-4 bg-card border-border shadow-xs space-y-2">
			<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
				<Smartphone class="h-4 w-4 text-primary shrink-0" />
				<span>Option A: Install App (Pre-synced)</span>
			</div>
			{#if pwaStore.canInstall && !pwaStore.isInstalled}
				<p class="text-xs text-muted-foreground leading-snug">
					Install Open Love directly to your device with this relationship profile pre-loaded.
				</p>
				<Button size="sm" class="w-full text-xs font-bold gap-1.5" onclick={handleInstallPWA}>
					<Download class="h-3.5 w-3.5" />
					<span>Install App Now</span>
				</Button>
			{:else if userOS === 'ios'}
				<p class="text-xs text-muted-foreground leading-snug">
					Tap the Safari <strong class="text-foreground">Share</strong> icon below, then select <strong class="text-foreground">"Add to Home Screen"</strong>. The app will install with this profile pre-loaded!
				</p>
			{:else if userOS === 'android'}
				<p class="text-xs text-muted-foreground leading-snug">
					Tap the <strong class="text-foreground">three dots (⋮)</strong> menu in Chrome and select <strong class="text-foreground">"Install app"</strong>.
				</p>
			{:else}
				<p class="text-xs text-muted-foreground leading-snug">
					Click the <strong class="text-foreground">Install App</strong> icon in your browser address bar.
				</p>
			{/if}
		</Card>

		<!-- Choice 2: Already Installed? Copy Code -->
		<Card class="p-3.5 sm:p-4 bg-card border-border shadow-xs space-y-2">
			<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
				<Copy class="h-4 w-4 text-primary shrink-0" />
				<span>Option B: Already have the app installed?</span>
			</div>
			<p class="text-xs text-muted-foreground leading-snug">
				Copy your sync code, open Open Love on your home screen, and tap <strong class="text-foreground">"Sync with Partner"</strong>.
			</p>
			<Button variant="outline" size="sm" class="w-full text-xs" onclick={copyCode}>
				{#if copied}
					<Check class="h-3.5 w-3.5 text-green-500 mr-1" />
					<span>Sync Code Copied!</span>
				{:else}
					<Copy class="h-3.5 w-3.5 mr-1" />
					<span>Copy Sync Code</span>
				{/if}
			</Button>
		</Card>

		<!-- Choice 3: Continue in browser -->
		<div class="pt-1">
			<Button class="w-full h-11 text-sm font-semibold" onclick={handleUseInBrowser}>
				<Sparkles class="h-4 w-4 mr-1.5" />
				<span>Continue in Browser</span>
			</Button>
		</div>
	</div>
</Modal>

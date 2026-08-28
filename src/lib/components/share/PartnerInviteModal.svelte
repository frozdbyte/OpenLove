<script lang="ts">
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge';
	import { Heart, Smartphone, Copy, Check, Sparkles, Download, Plus, RotateCcw, Calendar, Users } from '@lucide/svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { Bond } from '$lib/types/bonds';
	import type { ColorPalette } from '$lib/types/profile';
	import { calculateTimeBreakdown } from '$lib/utils/time';

	/** The sender's own accent color choice, carried through on `incomingBond`
	 * (`normalizeIncomingBond()` in `profile.svelte.ts` already resolves it) —
	 * styles this preview in *their* palette rather than the viewer's own
	 * active theme. Literal class strings, not template-interpolated, so
	 * Tailwind's scanner can see them — same map `JsonImportPreviewDrawer.svelte`
	 * already uses for the same reason. */
	const PALETTE_COLORS: Record<ColorPalette, { text: string; border: string; bg: string; solid: string }> = {
		rose: { text: 'text-rose-500', border: 'border-rose-500/25', bg: 'bg-rose-500/10', solid: 'bg-rose-500 hover:bg-rose-500/90' },
		lavender: { text: 'text-purple-500', border: 'border-purple-500/25', bg: 'bg-purple-500/10', solid: 'bg-purple-500 hover:bg-purple-500/90' },
		terracotta: { text: 'text-orange-600', border: 'border-orange-600/25', bg: 'bg-orange-600/10', solid: 'bg-orange-600 hover:bg-orange-600/90' },
		sage: { text: 'text-emerald-600', border: 'border-emerald-600/25', bg: 'bg-emerald-600/10', solid: 'bg-emerald-600 hover:bg-emerald-600/90' },
		midnight: { text: 'text-blue-600', border: 'border-blue-600/25', bg: 'bg-blue-600/10', solid: 'bg-blue-600 hover:bg-blue-600/90' }
	};

	interface Props {
		open?: boolean;
		incomingBond?: Partial<Bond> | null;
		partnerNames?: string;
		importRaw?: string;
		onAccept?: (mode: 'replace' | 'add') => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		incomingBond = null,
		partnerNames = 'Your Partner',
		importRaw = '',
		onAccept,
		onclose
	}: Props = $props();

	let copied = $state(false);
	let userOS = $derived(pwaStore.userOS);

	let effectiveNames = $derived(incomingBond?.names || partnerNames || 'Your Partner');
	let effectiveType = $derived(incomingBond?.type || 'romantic');
	let effectiveDate = $derived(incomingBond?.togetherSince || new Date().toISOString().split('T')[0]);
	let timeBreakdown = $derived(calculateTimeBreakdown(effectiveDate));
	let colors = $derived(PALETTE_COLORS[incomingBond?.colorPalette ?? 'rose']);

	let isUnconfigured = $derived(!profileStore.state.isConfigured);
	let isSingleBond = $derived(profileStore.state.isConfigured && profileStore.state.bonds.length === 1);
	let isMultiBond = $derived(profileStore.state.isConfigured && profileStore.state.bonds.length > 1);

	let currentActiveBond = $derived(profileStore.activeBond);

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

	function handleConfirm(mode: 'replace' | 'add') {
		open = false;
		onAccept?.(mode);
	}
</script>

<Modal
	bind:open
	title={isUnconfigured
		? `${effectiveType === 'friendship' ? 'Friendship' : 'Relationship'} Invite Received! ${effectiveType === 'friendship' ? '🌿' : '❤️'}`
		: `Received ${effectiveType === 'friendship' ? 'Friendship' : 'Relationship'} Invite`}
	description={isUnconfigured
		? `${effectiveType === 'friendship' ? 'Friendship' : 'Relationship'} counter for ${effectiveNames}`
		: `Review and add this profile to your Open Love app`}
	{onclose}
>
	<div class="space-y-4 text-left">
		<!-- Incoming Bond Preview Card -->
		<div class="p-4 rounded-2xl {colors.bg} border {colors.border} text-foreground space-y-3">
			<div class="flex items-center gap-3">
				<div class="h-12 w-12 rounded-full overflow-hidden {colors.bg} flex items-center justify-center {colors.text} shrink-0">
					{#if incomingBond?.photoUrl}
						<img src={incomingBond.photoUrl} alt={effectiveNames} class="h-full w-full object-cover" />
					{:else if effectiveType === 'friendship'}
						<Sparkles class="h-6 w-6 {colors.text} fill-current" />
					{:else}
						<Heart class="h-6 w-6 fill-current" />
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h3 class="font-bold text-base text-foreground truncate">{effectiveNames}</h3>
						<Badge variant={effectiveType === 'friendship' ? 'outline' : 'romantic'} class="text-[10px] shrink-0">
							{effectiveType === 'friendship' ? '🌿 Friend' : '💖 Couple'}
						</Badge>
					</div>
					<div class="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
						<Calendar class="h-3.5 w-3.5 shrink-0 {colors.text}" />
						<span>{effectiveType === 'friendship' ? 'Friends since' : 'Together since'} {effectiveDate}</span>
					</div>
				</div>
			</div>

			<div class="pt-2 {colors.border} border-t flex items-center justify-between text-xs text-foreground font-medium">
				<span>Journey Duration:</span>
				<span class="font-bold {colors.text}">{timeBreakdown.totalDays.toLocaleString()} days</span>
			</div>
		</div>

		{#if isUnconfigured}
			<!-- Case A: First-time setup -->
			<!-- Choice 1: Add to Home Screen -->
			<Card class="p-3.5 sm:p-4 bg-card border-border shadow-xs space-y-2">
				<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
					<Smartphone class="h-4 w-4 text-primary shrink-0" />
					<span>Option A: Install App (Pre-synced)</span>
				</div>
				{#if userOS === 'ios'}
					<p class="text-xs text-muted-foreground leading-snug">
						Tap the Safari <strong class="text-foreground">Share</strong> icon below, then select <strong class="text-foreground">"Add to Home Screen"</strong>. The app will install with this profile pre-loaded!
					</p>
				{:else}
					<p class="text-xs text-muted-foreground leading-snug">
						Install Open Love directly to your device with this relationship profile pre-loaded.
					</p>
					<Button size="sm" class="w-full text-xs font-bold gap-1.5 cursor-pointer" onclick={handleInstallPWA}>
						<Download class="h-3.5 w-3.5" />
						<span>Install App Now</span>
					</Button>
				{/if}
			</Card>

			<!-- Choice 2: Copy Code -->
			<Card class="p-3.5 sm:p-4 bg-card border-border shadow-xs space-y-2">
				<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
					<Copy class="h-4 w-4 text-primary shrink-0" />
					<span>Option B: Already have the app installed?</span>
				</div>
				<p class="text-xs text-muted-foreground leading-snug">
					Copy your sync code, open Open Love on your home screen, and tap <strong class="text-foreground">"Sync a Bond"</strong>.
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
				<Button class="w-full h-11 text-sm font-semibold {colors.solid}" onclick={() => handleConfirm('replace')}>
					<Sparkles class="h-4 w-4 mr-1.5" />
					<span>Continue in Browser</span>
				</Button>
			</div>
		{:else if isSingleBond}
			<!-- Case B: User has exactly 1 existing bond -->
			<div class="space-y-2.5 pt-1">
				<p class="text-xs text-muted-foreground">
					You currently have <strong class="text-foreground font-semibold">{currentActiveBond.names}</strong> configured. What would you like to do?
				</p>

				<Button class="w-full h-11 text-sm font-bold {colors.solid}" onclick={() => handleConfirm('add')}>
					<Plus class="h-4 w-4 mr-1.5" />
					<span>Add as New {effectiveType === 'friendship' ? 'Friendship' : 'Relationship'}</span>
				</Button>

				<Button
					variant="outline"
					class="w-full h-10 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
					onclick={() => handleConfirm('replace')}
				>
					<RotateCcw class="h-3.5 w-3.5 mr-1.5" />
					<span>Replace Current Bond ("{currentActiveBond.names}")</span>
				</Button>
			</div>
		{:else if isMultiBond}
			<!-- Case C: User already has multiple bonds -->
			<div class="space-y-2.5 pt-1">
				<p class="text-xs text-muted-foreground">
					Add <strong class="text-foreground font-semibold">{effectiveNames}</strong> to your tracked relationships and friendships ({profileStore.state.bonds.length} currently active).
				</p>

				<Button class="w-full h-11 text-sm font-bold {colors.solid}" onclick={() => handleConfirm('add')}>
					<Plus class="h-4 w-4 mr-1.5" />
					<span>Add to My Bonds ({profileStore.state.bonds.length + 1})</span>
				</Button>
			</div>
		{/if}
	</div>
</Modal>

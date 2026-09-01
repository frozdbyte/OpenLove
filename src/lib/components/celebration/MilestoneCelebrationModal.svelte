<script lang="ts">
	import type { Bond } from '$lib/types/bonds';
	import type { MilestoneItem } from '$lib/types/time';
	import { formatLongDate } from '$lib/utils/time';
	import { createKeyedPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';
	import Button from '$lib/components/ui/button';
	import { Heart, Sparkles, Share2, X, Trophy, PartyPopper, HeartHandshake } from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import { Portal } from 'bits-ui';

	interface Props {
		open?: boolean;
		bond: Bond;
		milestone: MilestoneItem;
		onShare: () => void;
		onclose?: () => void;
		onDisableAutoCelebrate?: () => void;
	}

	let {
		open = $bindable(false),
		bond,
		milestone,
		onShare,
		onclose,
		onDisableAutoCelebrate
	}: Props = $props();

	const photoGuard = createKeyedPhotoRetryGuard();

	let mounted = $state(false);
	let isVisible = $state(false);

	$effect(() => {
		if (open) {
			mounted = true;
			// Fire celebration confetti burst
			try {
				confetti({
					particleCount: 80,
					spread: 70,
					origin: { y: 0.5 },
					disableForReducedMotion: true
				});
				setTimeout(() => {
					confetti({
						particleCount: 50,
						angle: 60,
						spread: 55,
						origin: { x: 0, y: 0.65 },
						disableForReducedMotion: true
					});
					confetti({
						particleCount: 50,
						angle: 120,
						spread: 55,
						origin: { x: 1, y: 0.65 },
						disableForReducedMotion: true
					});
				}, 250);
			} catch {}

			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					isVisible = true;
				});
			});
		} else if (mounted && isVisible) {
			handleDismiss();
		}
	});

	function handleDismiss() {
		isVisible = false;
		setTimeout(() => {
			mounted = false;
			open = false;
			onclose?.();
		}, 260);
	}

	function handleShareClick() {
		handleDismiss();
		onShare();
	}

	function handleDisableClick() {
		onDisableAutoCelebrate?.();
		handleDismiss();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open && isVisible) {
			handleDismiss();
		}
	}

	const theme = $derived(bond.uiTheme || 'modern');
	const isFriendship = $derived(bond.type === 'friendship');

	// Theme-specific styling classes
	const cardStyle = $derived.by(() => {
		switch (theme) {
			case 'constellation':
				return {
					bg: 'bg-[#050713] text-white border-primary/40 shadow-primary/20',
					halo: 'border-primary/60 shadow-[0_0_35px_rgba(255,255,255,0.2)]',
					tag: '✦ WRITTEN IN THE STARS ✦',
					tagColor: 'text-primary'
				};
			case 'botanical':
				return {
					bg: 'bg-card text-card-foreground border-emerald-600/30 dark:border-emerald-500/30 shadow-2xl backdrop-blur-xl',
					halo: 'border-emerald-600/40 dark:border-emerald-400/40 shadow-emerald-500/10 shadow-lg',
					tag: '🌿 TOGETHER IN HARMONY 🌿',
					tagColor: 'text-emerald-700 dark:text-emerald-400'
				};
			case 'polaroid':
				return {
					bg: 'bg-[#faf7f2] dark:bg-stone-900 text-stone-900 dark:text-stone-100 border-amber-500/20 shadow-xl',
					halo: 'border-white dark:border-stone-800 shadow-lg ring-1 ring-black/5',
					tag: '📸 CAPTURED MOMENT',
					tagColor: 'text-stone-700 dark:text-stone-300'
				};
			case 'monograph':
				return {
					bg: 'bg-[#141416] text-white border-white/20 shadow-2xl',
					halo: 'border-white/40 shadow-none',
					tag: 'M O N O G R A P H • SPECIAL EDITION',
					tagColor: 'text-white/80'
				};
			case 'traditional':
				return {
					bg: 'bg-card text-card-foreground border-rose-500/30 shadow-2xl',
					halo: 'border-rose-500/40 shadow-rose-500/20 shadow-lg',
					tag: '❤️ SPECIAL MILESTONE DAY ❤️',
					tagColor: 'text-rose-600 dark:text-rose-400'
				};
			default: // modern / cover
				return {
					bg: 'bg-card/95 text-card-foreground border-primary/30 shadow-2xl backdrop-blur-xl',
					halo: 'border-primary/40 shadow-primary/20 shadow-lg',
					tag: '🎉 TODAY IS A SPECIAL DAY 🎉',
					tagColor: 'text-primary'
				};
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if mounted}
<Portal>
	<!-- Backdrop with smooth opacity & blur -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md transition-opacity duration-250 ease-out cursor-pointer"
		class:opacity-100={isVisible}
		class:opacity-0={!isVisible}
		onclick={handleDismiss}
	></div>

	<!-- Celebration Story Card Modal -->
	<div
		class="fixed inset-x-4 inset-y-6 z-50 flex items-center justify-center pointer-events-none"
	>
		<div
			class="pointer-events-auto relative w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-[2.5rem] border p-6 flex flex-col items-center text-center justify-between shadow-2xl transition-all duration-300 ease-out {cardStyle.bg}"
			style:transform={!isVisible ? 'scale(0.92) translateY(20px)' : 'scale(1) translateY(0)'}
			style:opacity={!isVisible ? '0' : '1'}
			role="dialog"
			aria-modal="true"
			aria-label="Milestone celebration"
		>
			<!-- Close button -->
			<button
				type="button"
				class="absolute top-4 right-4 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
				onclick={handleDismiss}
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>

			<!-- Top Celebration Tag -->
			<div class="pt-2">
				<span class="text-[11px] font-extrabold tracking-widest uppercase {cardStyle.tagColor}">
					{cardStyle.tag}
				</span>
			</div>

			<!-- Main Avatar & Photo Area -->
			<div class="my-4 relative">
				<div class="relative h-28 w-28 mx-auto rounded-full p-1 border-2 {cardStyle.halo}">
					<div class="h-full w-full rounded-full overflow-hidden bg-muted flex items-center justify-center shadow-inner">
						{#if bond.photoUrl}
							<img
								src={bond.photoUrl}
								alt={bond.names}
								class="h-full w-full object-cover"
								onerror={() => photoGuard.handleError(bond)}
								onload={() => photoGuard.handleLoad(bond)}
							/>
						{:else if isFriendship}
							<div class="h-full w-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
								<Sparkles class="h-12 w-12" />
							</div>
						{:else}
							<div class="h-full w-full bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-500">
								<Heart class="h-12 w-12 fill-rose-500/30" />
							</div>
						{/if}
					</div>

					<!-- Floating celebration mini badge -->
					<div class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background">
						{#if milestone.type === 'years'}
							<PartyPopper class="h-4 w-4" />
						{:else if milestone.type === 'custom'}
							<HeartHandshake class="h-4 w-4" />
						{:else}
							<Trophy class="h-4 w-4" />
						{/if}
					</div>
				</div>
			</div>

			<!-- Central Milestone Headline & Details -->
			<div class="space-y-2 mb-6">
				<h2 class="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
					{milestone.title}
				</h2>
				<p class="text-base font-bold opacity-90">
					{bond.names}
				</p>
				<p class="text-xs opacity-75">
					{isFriendship ? 'Friends' : 'Together'} since {formatLongDate(bond.togetherSince)}
				</p>
			</div>

			<!-- Action Buttons -->
			<div class="w-full space-y-2 pt-2">
				<Button
					size="lg"
					class="w-full font-bold shadow-lg gap-2 text-sm h-12 rounded-2xl cursor-pointer"
					onclick={handleShareClick}
				>
					<Share2 class="h-4 w-4" />
					<span>Share Milestone Card ✨</span>
				</Button>

				<Button
					variant="ghost"
					size="sm"
					class="w-full text-xs opacity-75 hover:opacity-100 cursor-pointer"
					onclick={handleDismiss}
				>
					<span>Continue to Open Love</span>
				</Button>

				<!-- Small Don't Show Again Toggle Link -->
				<div class="pt-2 text-center">
					<button
						type="button"
						class="text-[11px] opacity-50 hover:opacity-90 underline underline-offset-2 transition-opacity cursor-pointer"
						onclick={handleDisableClick}
					>
						Don't show celebration cards
					</button>
				</div>
			</div>
		</div>
	</div>
</Portal>
{/if}

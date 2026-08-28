<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Settings, Heart, Share2, Sparkles, ChevronDown } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import BondFallbackIcon from '$lib/components/themes/shared/BondFallbackIcon.svelte';
	import { createPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';

	let { profile, bond, timeBreakdown, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	const photoGuard = createPhotoRetryGuard(() => bond?.id, () => bond?.photoBlob);
</script>

<div class="min-h-svh w-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-serif selection:bg-primary selection:text-primary-foreground">
	<!-- Traditional Top Bar styled with active accent color -->
	<header class="w-full bg-primary text-primary-foreground px-4 py-3.5 flex items-center justify-between shadow-md select-none sticky top-0 z-30 transition-colors duration-300">
		<button
			type="button"
			class="p-1.5 -ml-1 text-primary-foreground/90 hover:text-primary-foreground hover:bg-black/15 dark:hover:bg-white/15 rounded-full transition-colors cursor-pointer"
			onclick={onOpenSettings}
			aria-label="Settings"
		>
			<Settings class="h-6 w-6 stroke-[1.75]" />
		</button>

		<button
			type="button"
			class="flex items-center justify-center gap-1.5 flex-1 px-2 cursor-pointer hover:opacity-90 transition-opacity"
			onclick={onOpenSwitcher}
			aria-label="Switch relationship or friendship"
		>
			<h1 class="text-xl sm:text-2xl font-serif text-center font-normal tracking-wide truncate">
				{profile.names}
			</h1>
			<ChevronDown class="h-4 w-4 opacity-75 shrink-0" />
		</button>

		<button
			type="button"
			class="p-1.5 -mr-1 text-primary-foreground/90 hover:text-primary-foreground hover:bg-black/15 dark:hover:bg-white/15 rounded-full transition-colors cursor-pointer"
			onclick={onOpenShare}
			aria-label="Share"
		>
			<Share2 class="h-5 w-5 stroke-[1.75]" />
		</button>
	</header>

	<!-- Offline / pending-sync banner, styled to the top bar -->
	<SyncStatusPill variant="traditional" class="sticky top-[3.75rem] z-20 shadow-sm" />

	<!-- Edge-to-Edge Hero Image Container -->
	<div class="relative w-full aspect-square! max-h-[50vh] min-h-48 bg-zinc-200 dark:bg-zinc-800 overflow-hidden select-none">
		{#if profile.photoUrl}
			<img
				src={profile.photoUrl}
				alt={profile.names}
				class="w-full h-full object-cover object-center"
				onerror={photoGuard.handleError}
				onload={photoGuard.handleLoad}
			/>
		{:else}
			<BondFallbackIcon
				{isFriendship}
				containerClass="bg-gradient-to-tr from-primary/30 via-accent to-primary/10 dark:from-zinc-900 dark:via-primary/20 dark:to-zinc-800"
				iconClass={isFriendship ? 'h-20 w-20 opacity-40 animate-pulse' : 'h-20 w-20 fill-current opacity-30 animate-pulse'}
				caption={isFriendship ? 'Add friend photo in settings' : 'Add couple photo in settings'}
				captionClass="text-xs font-sans tracking-wider uppercase mt-2 opacity-60"
			/>
		{/if}

		<!-- Translucent Date Banner Overlay -->
		<div class="absolute inset-x-0 bottom-0 py-0.5 px-4 bg-black/45 backdrop-blur-[2px] text-center">
			<p class="text-white text-lg sm:text-xl font-serif tracking-wide drop-shadow">
				{timeBreakdown.startDateFormatted}
			</p>
		</div>
	</div>

	<!-- Content Area -->
	<main class="flex-1 flex flex-col justify-around py-8 px-6 text-center max-w-md mx-auto w-full space-y-4">
		<!-- Primary Section -->
		<section class="space-y-1">
			<h2 class="text-lg tracking-tight uppercase font-sans text-primary font-semibold transition-colors duration-300">
				{isFriendship ? 'YOU HAVE BEEN FRIENDS FOR' : 'YOU HAVE BEEN TOGETHER FOR'}
			</h2>
			<p class="text-xl sm:text-2xl font-serif text-zinc-800 dark:text-zinc-100 font-normal leading-relaxed">
				{timeBreakdown.primaryFormatted}
			</p>
		</section>

		<!-- Divider -->
		<div class="w-full border-t border-zinc-200 dark:border-zinc-800"></div>

		<!-- Secondary Section ("IN OTHER WORDS") -->
		<section class="space-y-4">
			<h2 class="text-lg tracking-tight uppercase font-sans text-primary font-semibold transition-colors duration-300">
				IN OTHER WORDS
			</h2>

			<div class="space-y-2 text-xl font-serif text-zinc-800 dark:text-zinc-200 leading-snug">
				<p>{timeBreakdown.totalMonths.toLocaleString()} months</p>
				<p class="flex items-center justify-center gap-3">
					<span class="text-zinc-500 dark:text-zinc-400 text-base italic">or</span>
					<span>{timeBreakdown.totalWeeks.toLocaleString()} weeks</span>
				</p>
				<p class="flex items-center justify-center gap-3">
					<span class="text-zinc-500 dark:text-zinc-400 text-base italic">or</span>
					<span>{timeBreakdown.totalDays.toLocaleString()} days</span>
				</p>
				{#if profile.showSeconds}
					<p class="flex items-center justify-center gap-3">
						<span class="text-zinc-500 dark:text-zinc-400 text-base italic">or</span>
						<span>{timeBreakdown.totalHours.toLocaleString()} hours</span>
					</p>
					<p class="flex items-center justify-center gap-3 text-base text-zinc-600 dark:text-zinc-400">
						<span class="italic">or</span>
						<span class="font-mono">{timeBreakdown.totalSeconds.toLocaleString()} seconds</span>
					</p>
				{/if}
			</div>
		</section>
	</main>
</div>

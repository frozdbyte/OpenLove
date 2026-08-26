<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Settings, Heart, Share2 } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';

	let { profile, timeBreakdown, onOpenSettings, onOpenShare }: ThemeProps = $props();
</script>

<div class="min-h-screen w-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-serif selection:bg-rose-800 selection:text-white">
	<!-- Traditional Crimson Top Bar -->
	<header class="w-full bg-[#8B1E2D] dark:bg-[#5A121E] text-white px-4 py-3.5 flex items-center justify-between shadow-md select-none sticky top-0 z-30">
		<button
			type="button"
			class="p-1.5 -ml-1 text-white/90 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
			onclick={onOpenSettings}
			aria-label="Settings"
		>
			<Settings class="h-6 w-6 stroke-[1.75]" />
		</button>

		<h1 class="text-xl sm:text-2xl font-serif text-center font-normal tracking-wide flex-1 px-2 truncate">
			{profile.names}
		</h1>

		<button
			type="button"
			class="p-1.5 -mr-1 text-white/90 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
			onclick={onOpenShare}
			aria-label="Share"
		>
			<Share2 class="h-5 w-5 stroke-[1.75]" />
		</button>
	</header>

	<!-- Offline / pending-sync banner, styled to the crimson top bar -->
	<SyncStatusPill variant="traditional" class="sticky top-[3.75rem] z-20 shadow-sm" />

	<!-- Edge-to-Edge Hero Image Container -->
	<div class="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[50vh] bg-zinc-200 dark:bg-zinc-800 overflow-hidden select-none">
		{#if profile.photoUrl}
			<img
				src={profile.photoUrl}
				alt={profile.names}
				class="w-full h-full object-cover object-center"
			/>
		{:else}
			<div class="w-full h-full bg-gradient-to-tr from-[#8B1E2D]/40 via-rose-200 to-amber-100 dark:from-zinc-900 dark:via-rose-950 dark:to-zinc-800 flex flex-col items-center justify-center text-[#8B1E2D] dark:text-rose-300">
				<Heart class="h-20 w-20 fill-current opacity-30 animate-pulse" />
				<span class="text-xs font-sans tracking-wider uppercase mt-2 opacity-60">Add couple photo in settings</span>
			</div>
		{/if}

		<!-- Translucent Date Banner Overlay -->
		<div class="absolute inset-x-0 bottom-0 py-2.5 px-4 bg-black/45 backdrop-blur-[2px] text-center">
			<p class="text-white text-lg sm:text-xl italic font-serif tracking-wide drop-shadow">
				{timeBreakdown.startDateFormatted}
			</p>
		</div>
	</div>

	<!-- Content Area -->
	<main class="flex-1 flex flex-col justify-around py-8 px-6 text-center max-w-md mx-auto w-full space-y-8">
		<!-- Primary Section -->
		<section class="space-y-3">
			<h2 class="text-base sm:text-lg tracking-[0.18em] uppercase font-serif text-[#8B1E2D] dark:text-rose-400 font-semibold">
				YOU HAVE BEEN TOGETHER FOR
			</h2>
			<p class="text-xl sm:text-2xl font-serif text-zinc-800 dark:text-zinc-100 font-normal leading-relaxed">
				{timeBreakdown.primaryFormatted}
			</p>
		</section>

		<!-- Divider -->
		<div class="w-full border-t border-zinc-200 dark:border-zinc-800 my-2"></div>

		<!-- Secondary Section ("IN OTHER WORDS") -->
		<section class="space-y-4">
			<h2 class="text-base sm:text-lg tracking-[0.18em] uppercase font-serif text-[#8B1E2D] dark:text-rose-400 font-semibold">
				IN OTHER WORDS
			</h2>

			<div class="space-y-2 text-lg sm:text-xl font-serif text-zinc-800 dark:text-zinc-200 leading-snug">
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

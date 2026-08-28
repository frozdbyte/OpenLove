<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Heart, Settings, Share2, Sparkles, ChevronDown } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import ThemeIconButton from '$lib/components/themes/shared/ThemeIconButton.svelte';
	import HeroCounterCard from '$lib/components/themes/shared/HeroCounterCard.svelte';
	import StatBreakdownGrid from '$lib/components/themes/shared/StatBreakdownGrid.svelte';
	import NextMilestoneCard from '$lib/components/themes/shared/NextMilestoneCard.svelte';
	import BondFallbackIcon from '$lib/components/themes/shared/BondFallbackIcon.svelte';
	import { createPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';

	let { profile, bond, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	const photoGuard = createPhotoRetryGuard(() => bond?.id, () => bond?.photoBlob);
</script>

<div class="relative min-h-svh w-full flex flex-col justify-between pb-6 sm:pb-8 overflow-x-hidden bg-background">
	<!-- Full-Width Edge-to-Edge Cover Photo starting from top screen edge -->
	<div class="absolute inset-x-0 top-0 h-[58vh] min-h-[380px] max-h-[620px] max-w-full lg:max-w-lg  mx-auto overflow-hidden select-none z-0">
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
				containerClass={isFriendship
					? 'bg-gradient-to-br from-emerald-200/50 via-primary/20 to-teal-300/40 dark:from-emerald-950/50 dark:via-zinc-900 dark:to-zinc-950'
					: 'bg-gradient-to-br from-rose-200/50 via-primary/20 to-rose-300/40 dark:from-rose-950/50 dark:via-zinc-900 dark:to-zinc-950'}
				iconClass={isFriendship ? 'h-16 w-16 animate-gentle-pulse' : 'h-16 w-16 fill-primary/20 stroke-primary animate-gentle-pulse'}
				caption={isFriendship ? 'Add friend photo in settings' : 'Add couple photo in settings'}
				captionClass="text-xs font-medium text-muted-foreground mt-2"
			/>
		{/if}

		<!-- Top Gradient: Seamlessly fades from header background to transparent without muddy dark bands -->
		<div class="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-background/85 via-background/40 to-background/0 pointer-events-none z-10"></div>

		<!-- Bottom Gradient: Perfectly matches the middle layout background (rose-50/background in light, zinc-900 in dark) -->
		<div class="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background via-background/60 to-background/0 pointer-events-none z-10"></div>
	</div>

	<!-- Top Bar Header with Names at the Top -->
	<div class="relative z-20 w-full max-w-md mx-auto px-4 pt-5 shrink-0">
		<header class="flex items-center justify-between py-1.5">
			<ThemeIconButton icon={Settings} onclick={onOpenSettings} ariaLabel="Settings" shrink />

			<button
				type="button"
				class="group flex flex-col items-center text-center px-2 flex-1 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
				onclick={onOpenSwitcher}
				aria-label="Switch relationship or friendship"
			>
				<div class="flex items-center gap-1 max-w-full">
					<h1 class="text-base sm:text-lg font-extrabold text-foreground tracking-tight truncate drop-shadow-xs">
						{profile.names}
					</h1>
					<ChevronDown class="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
				</div>
				<p class="text-[11px] text-muted-foreground font-medium drop-shadow-xs">
					{isFriendship ? 'Friends since' : 'Since'} {timeBreakdown.startDateFormatted}
				</p>
			</button>

			<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share with Partner" shrink />
		</header>

		<!-- Offline / pending-sync indicator -->
		<div class="flex justify-center mt-0.5">
			<SyncStatusPill variant="modern" />
		</div>
	</div>

	<!-- Main Content Section pushed down towards bottom of viewport -->
	<main class="relative z-20 w-full max-w-md mx-auto px-4 space-y-3 mt-auto pt-[28vh] sm:pt-[34vh] pb-2">
		<!-- Sleek Compact Hero Counter Card to showcase more photo -->
		<HeroCounterCard
			{isFriendship}
			primaryFormatted={timeBreakdown.primaryFormatted}
			totalSeconds={timeBreakdown.totalSeconds}
			showSeconds={profile.showSeconds}
			variant="compact"
		/>

		<!-- Stacked Breakdown Cards -->
		<StatBreakdownGrid
			{isFriendship}
			totalMonths={timeBreakdown.totalMonths}
			totalWeeks={timeBreakdown.totalWeeks}
			totalDays={timeBreakdown.totalDays}
			totalHours={timeBreakdown.totalHours}
			variant="compact"
		/>

		<!-- Next Milestone Progress Bar. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			<NextMilestoneCard {nextMilestone} variant="compact" />
		{/key}
	</main>
</div>

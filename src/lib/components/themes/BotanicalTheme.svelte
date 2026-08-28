<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Settings, Share2, ChevronDown, Leaf, Sprout } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import BondFallbackIcon from '$lib/components/themes/shared/BondFallbackIcon.svelte';
	import ThemeIconButton from '$lib/components/themes/shared/ThemeIconButton.svelte';
	import { createPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';
	import { statValueSizeClass } from '$lib/components/themes/shared/statValueSizeClass';

	let { profile, bond, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	const photoGuard = createPhotoRetryGuard(() => bond?.id, () => bond?.photoBlob);
</script>

<div class="relative min-h-svh w-full max-w-md mx-auto px-4 py-6 flex flex-col justify-between pb-12">
	<!-- Top Bar -->
	<header class="flex items-center justify-between py-2">
		<ThemeIconButton icon={Settings} onclick={onOpenSettings} ariaLabel="Settings" />

		<button
			type="button"
			class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/15 transition-all cursor-pointer shadow-2xs"
			onclick={onOpenSwitcher}
			aria-label="Switch Relationship or Friendship"
		>
			{#if isFriendship}
				<Sprout class="h-3.5 w-3.5 fill-primary/40 text-primary" />
				<span>Friendship</span>
			{:else}
				<Leaf class="h-3.5 w-3.5 fill-primary/40 text-primary" />
				<span>Growing Together</span>
			{/if}
			<ChevronDown class="h-3 w-3 opacity-60 ml-0.5" />
		</button>

		<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share with Partner" />
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="flex justify-center">
		<SyncStatusPill variant="modern" class="border-primary/20" />
	</div>

	<!-- Main Organic Content -->
	<main class="space-y-6 my-auto pt-2 pb-6">
		<!-- Organic Pebble Photo Frame -->
		<div class="flex flex-col items-center text-center">
			<button
				type="button"
				class="relative group cursor-pointer focus:outline-hidden"
				onclick={onOpenSwitcher}
				aria-label="Switch bond"
			>
				<!-- Subtle primary aura glow -->
				<div class="absolute -inset-2 rounded-[50%] bg-primary/15 dark:bg-primary/10 blur-xl group-hover:bg-primary/25 transition-all duration-700"></div>

				<div class="relative w-44 h-44 sm:w-48 sm:h-48 rounded-[42%_58%_70%_30%/45%_45%_55%_55%] overflow-hidden border-2 border-primary/30 bg-card shadow-lg transition-all duration-700 group-hover:rounded-[58%_42%_30%_70%/55%_55%_45%_45%]">
					{#if profile.photoUrl}
						<img
							src={profile.photoUrl}
							alt={profile.names}
							class="h-full w-full object-cover"
							onerror={photoGuard.handleError}
							onload={photoGuard.handleLoad}
						/>
					{:else}
						<BondFallbackIcon
							{isFriendship}
							containerClass="bg-gradient-to-br from-primary/10 to-accent"
							iconClass={isFriendship ? 'h-14 w-14 text-primary' : 'h-14 w-14 fill-primary/20 stroke-primary'}
							caption={isFriendship ? 'Add friend photo' : 'Add couple photo'}
							captionClass="text-xs font-sans text-primary/80 mt-2"
						/>
					{/if}
				</div>

				<div class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-md">
					<Sprout class="h-4 w-4" />
				</div>
			</button>

			<div class="mt-4">
				<h1 class="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
					{profile.names}
				</h1>
				<p class="text-xs text-muted-foreground mt-0.5">
					Rooted since {timeBreakdown.startDateFormatted}
				</p>
			</div>
		</div>

		<!-- Zen Growth Counter Card -->
		<div class="relative rounded-3xl bg-primary/5 dark:bg-primary/10 border border-primary/20 p-5 text-center shadow-xs">
			<span class="text-xs font-semibold uppercase tracking-wider text-primary block">
				{isFriendship ? 'Days of Friendship' : 'Days Flourishing Together'}
			</span>

			<div class="mt-1 flex items-center justify-center gap-1.5">
				<span class="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground">
					{timeBreakdown.totalDays.toLocaleString()}
				</span>
				<span class="text-xs font-medium text-muted-foreground self-end mb-1.5">days</span>
			</div>

			<p class="text-xs text-muted-foreground mt-1">
				{timeBreakdown.primaryFormatted}
			</p>

			{#if profile.showSeconds}
				<div class="mt-2 pt-2 border-t border-primary/10 text-[11px] font-mono text-muted-foreground">
					<span class="font-bold text-foreground">{timeBreakdown.totalSeconds.toLocaleString()}</span> seconds
				</div>
			{/if}
		</div>

		<!-- Organic Metric Pills Grid -->
		<div class="grid grid-cols-3 gap-2">
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Years</span>
				<span class="{statValueSizeClass(timeBreakdown.years)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.years}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Months</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMonths)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMonths.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Weeks</span>
				<span class="{statValueSizeClass(timeBreakdown.totalWeeks)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalWeeks.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Days</span>
				<span class="{statValueSizeClass(timeBreakdown.totalDays)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalDays.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Hours</span>
				<span class="{statValueSizeClass(timeBreakdown.totalHours)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalHours.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-border/70 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] uppercase font-bold text-muted-foreground block truncate">Minutes</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMinutes)} font-extrabold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMinutes.toLocaleString()}</span>
			</div>
		</div>

		<!-- Next Bloom Milestone. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			{#if nextMilestone}
				<div class="rounded-3xl bg-card/80 dark:bg-card/50 border border-primary/20 p-4 shadow-xs">
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-1.5 min-w-0 mr-2">
							<Leaf class="h-3.5 w-3.5 text-primary fill-primary/30 shrink-0" />
							<span class="text-xs font-bold text-foreground truncate">
								{nextMilestone.milestone.title}
							</span>
						</div>
						<span class="text-[11px] font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded-full shrink-0">
							{#if nextMilestone.daysLeft === 0}
								Blooming today! 🌸
							{:else}
								in {nextMilestone.daysLeft} {nextMilestone.daysLeft === 1 ? 'day' : 'days'}
							{/if}
						</span>
					</div>

					<!-- Progress bar -->
					<div class="w-full bg-secondary rounded-full h-2 overflow-hidden">
						<div
							class="bg-primary h-full rounded-full transition-all duration-500"
							style="width: {nextMilestone.progressPercentage}%"
						></div>
					</div>

					<div class="flex justify-between items-center text-[10px] text-muted-foreground mt-1.5 font-medium">
						<span>Target: {nextMilestone.daysLeft}d left</span>
						<span>{nextMilestone.progressPercentage}%</span>
					</div>
				</div>
			{/if}
		{/key}
	</main>
</div>

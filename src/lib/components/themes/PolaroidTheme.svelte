<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Heart, Settings, Share2, Sparkles, ChevronDown, Sparkle } from '@lucide/svelte';
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
			class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all cursor-pointer shadow-2xs"
			onclick={onOpenSwitcher}
			aria-label="Switch Relationship or Friendship"
		>
			{#if isFriendship}
				<Sparkles class="h-3.5 w-3.5 fill-primary text-primary" />
				<span>Friends</span>
			{:else}
				<Heart class="h-3.5 w-3.5 fill-primary text-primary animate-heartbeat" />
				<span>Together</span>
			{/if}
			<ChevronDown class="h-3 w-3 opacity-60 ml-0.5" />
		</button>

		<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share with Partner" />
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="flex justify-center">
		<SyncStatusPill variant="modern" class="border-dashed font-mono tracking-wider" />
	</div>

	<!-- Main Content Section -->
	<main class="space-y-6 my-auto pt-2 pb-6">
		<!-- Polaroid Photo Card -->
		<div class="flex flex-col items-center">
			<button
				type="button"
				class="relative group cursor-pointer text-left focus:outline-hidden"
				onclick={onOpenSwitcher}
				aria-label="Switch bond"
			>
				<!-- Polaroid Container -->
				<div class="relative bg-card border-2 border-border/80 rounded-xs p-3 pb-5 shadow-xl transition-all duration-300 group-hover:rotate-0 group-hover:scale-[1.02] -rotate-1 sm:-rotate-2 w-64 sm:w-72">
					<!-- Decorative Washi Tape -->
					<div class="absolute -top-3.5 left-1/2 -translate-x-1/2 w-28 h-7 bg-primary/20 dark:bg-primary/25 backdrop-blur-xs shadow-xs border-y border-dashed border-primary/40 rotate-1 z-20 pointer-events-none flex items-center justify-center">
						<span class="text-[9px] uppercase tracking-widest font-mono text-primary font-bold">MEMORIES</span>
					</div>

					<!-- Inner Photo Window -->
					<div class="relative aspect-square w-full rounded-2xs overflow-hidden bg-muted border border-border/60">
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
								containerClass="bg-muted"
								iconClass={isFriendship ? 'h-14 w-14 text-primary' : 'h-14 w-14 fill-primary/20 stroke-primary'}
								caption={isFriendship ? 'Add friend photo' : 'Add couple photo'}
								captionClass="text-xs font-serif italic text-muted-foreground mt-2"
							/>
						{/if}
					</div>

					<!-- Handwritten / Stamped Polaroid Caption -->
					<div class="mt-3.5 text-center px-1">
						<h1 class="text-base sm:text-lg font-serif italic font-bold text-foreground tracking-tight truncate">
							{profile.names}
						</h1>
						<p class="text-xs font-mono text-muted-foreground mt-0.5 tracking-wider">
							★ {timeBreakdown.startDateFormatted} ★
						</p>
					</div>
				</div>
			</button>
		</div>

		<!-- Days Together Archival Paper Badge -->
		<div class="relative bg-card/90 dark:bg-card/70 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-sm text-center overflow-hidden">
			<!-- Corner Tape Decors -->
			<div class="absolute top-0 right-0 w-8 h-8 bg-primary/10 -rotate-45 transform translate-x-3 -translate-y-3 pointer-events-none"></div>

			<span class="text-[11px] font-mono tracking-widest uppercase text-primary font-semibold block">
				{isFriendship ? 'Days of Friendship' : 'Days in Love'}
			</span>

			<div class="mt-1 flex items-center justify-center gap-2">
				<span class="text-4xl sm:text-5xl font-extrabold font-serif tracking-tight text-foreground">
					{timeBreakdown.totalDays.toLocaleString()}
				</span>
				<span class="text-sm font-serif italic text-muted-foreground self-end mb-1">days</span>
			</div>

			<p class="text-xs font-serif text-muted-foreground mt-1">
				{timeBreakdown.primaryFormatted}
			</p>

			{#if profile.showSeconds}
				<div class="mt-2 pt-2 border-t border-border/50 text-[11px] font-mono text-muted-foreground">
					<span class="font-bold text-foreground">{timeBreakdown.totalSeconds.toLocaleString()}</span> ticking seconds
				</div>
			{/if}
		</div>

		<!-- Scrapbook Stats Grid -->
		<div class="grid grid-cols-3 gap-2">
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Years</span>
				<span class="{statValueSizeClass(timeBreakdown.years)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.years}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Months</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMonths)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMonths.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Weeks</span>
				<span class="{statValueSizeClass(timeBreakdown.totalWeeks)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalWeeks.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Days</span>
				<span class="{statValueSizeClass(timeBreakdown.totalDays)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalDays.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Hours</span>
				<span class="{statValueSizeClass(timeBreakdown.totalHours)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalHours.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/50 border border-border/70 rounded-xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Minutes</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMinutes)} font-bold font-serif text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMinutes.toLocaleString()}</span>
			</div>
		</div>

		<!-- Next Milestone Pinned Tag. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			{#if nextMilestone}
				<div class="relative bg-card/85 dark:bg-card/65 border border-primary/20 rounded-2xl p-4 shadow-xs">
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-1.5 min-w-0 mr-2">
							<Sparkle class="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
							<span class="text-xs font-serif italic font-bold text-foreground truncate">
								{nextMilestone.milestone.title}
							</span>
						</div>
						<span class="text-[11px] font-mono font-semibold text-primary px-2 py-0.5 bg-primary/10 rounded-full shrink-0">
							{#if nextMilestone.daysLeft === 0}
								Today! 🎉
							{:else}
								in {nextMilestone.daysLeft} {nextMilestone.daysLeft === 1 ? 'day' : 'days'}
							{/if}
						</span>
					</div>

					<!-- Progress bar -->
					<div class="w-full bg-secondary rounded-full h-2 overflow-hidden">
						<div
							class="bg-gradient-to-r from-primary to-rose-400 h-full rounded-full transition-all duration-500"
							style="width: {nextMilestone.progressPercentage}%"
						></div>
					</div>

					<div class="flex justify-between items-center text-[10px] font-mono text-muted-foreground mt-1.5">
						<span>Target: {nextMilestone.daysLeft}d left</span>
						<span>{nextMilestone.progressPercentage}%</span>
					</div>
				</div>
			{/if}
		{/key}
	</main>
</div>

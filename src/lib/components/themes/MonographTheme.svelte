<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Settings, Share2, ChevronDown } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import BondFallbackIcon from '$lib/components/themes/shared/BondFallbackIcon.svelte';
	import ThemeIconButton from '$lib/components/themes/shared/ThemeIconButton.svelte';
	import { createPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';
	import { statValueSizeClass } from '$lib/components/themes/shared/statValueSizeClass';

	let { profile, bond, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	const photoGuard = createPhotoRetryGuard(() => bond?.id, () => bond?.photoBlob);
</script>

<div class="relative min-h-svh w-full max-w-md mx-auto px-5 py-6 flex flex-col justify-between pb-12 font-serif">
	<!-- Top Bar -->
	<header class="flex items-center justify-between py-2 border-b border-foreground/10 pb-3">
		<ThemeIconButton icon={Settings} onclick={onOpenSettings} ariaLabel="Settings" />

		<button
			type="button"
			class="flex items-center gap-1.5 px-3 py-1 cursor-pointer hover:opacity-75 transition-opacity"
			onclick={onOpenSwitcher}
			aria-label="Switch Relationship or Friendship"
		>
			<span class="text-xs font-mono uppercase tracking-[0.2em] text-primary font-bold">
				{isFriendship ? 'FRIENDSHIP' : 'MEMOIR'}
			</span>
			<ChevronDown class="h-3 w-3 opacity-60 ml-0.5" />
		</button>

		<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share with Partner" />
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="flex justify-center mt-2">
		<SyncStatusPill variant="modern" class="rounded-none border-foreground/15 font-mono tracking-widest text-[10px]" />
	</div>

	<!-- Main Editorial Content -->
	<main class="space-y-6 my-auto pt-2 pb-6">
		<!-- Issue Dateline -->
		<div class="text-center">
			<p class="text-[10px] font-mono uppercase tracking-[0.25em] text-primary font-medium">
				ISSUE NO. {timeBreakdown.totalDays.toLocaleString()} — VOL. {timeBreakdown.years + 1}
			</p>
		</div>

		<!-- Asymmetric Portrait Card -->
		<div class="flex flex-col items-center">
			<button
				type="button"
				class="group cursor-pointer text-center focus:outline-hidden"
				onclick={onOpenSwitcher}
				aria-label="Switch bond"
			>
				<div class="p-1.5 bg-card border border-foreground/15 shadow-md transition-all duration-300 group-hover:shadow-lg w-56 sm:w-64">
					<div class="relative aspect-4/5 w-full bg-muted overflow-hidden">
						{#if profile.photoUrl}
							<img
								src={profile.photoUrl}
								alt={profile.names}
								class="h-full w-full object-cover grayscale-25 contrast-105 group-hover:grayscale-0 transition-all duration-500"
								onerror={photoGuard.handleError}
								onload={photoGuard.handleLoad}
							/>
						{:else}
							<BondFallbackIcon
								{isFriendship}
								containerClass="bg-muted"
								iconClass={isFriendship ? 'h-12 w-12 text-primary/70' : 'h-12 w-12 stroke-primary/70 fill-primary/10'}
								caption={isFriendship ? 'Monograph Portrait' : 'Monograph Portrait'}
								captionClass="text-[10px] font-mono tracking-widest uppercase text-muted-foreground mt-2"
							/>
						{/if}
					</div>
				</div>

				<h1 class="text-xl sm:text-2xl font-serif italic text-foreground tracking-tight mt-3">
					{profile.names}
				</h1>
				<p class="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
					Since {timeBreakdown.startDateFormatted}
				</p>
			</button>
		</div>

		<!-- Large Typographic Counter -->
		<div class="text-center py-2">
			<span class="text-5xl sm:text-6xl font-serif font-normal italic tracking-tight text-foreground block">
				{timeBreakdown.totalDays.toLocaleString()}
			</span>
			<span class="text-xs font-mono uppercase tracking-[0.2em] text-primary font-semibold mt-1 block">
				{isFriendship ? 'Days of Friendship' : 'Days Together'}
			</span>
			<p class="text-xs font-serif text-muted-foreground/90 mt-1 italic">
				{timeBreakdown.primaryFormatted}
			</p>

			{#if profile.showSeconds}
				<div class="text-[11px] font-mono text-muted-foreground/75 mt-1.5">
					{timeBreakdown.totalSeconds.toLocaleString()} seconds
				</div>
			{/if}
		</div>

		<!-- Editorial Divider Rules & Column Stats -->
		<div class="border-y border-foreground/10 py-3.5">
			<div class="grid grid-cols-3 divide-x divide-foreground/10 text-center">
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Years</span>
					<span class="{statValueSizeClass(timeBreakdown.years)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.years}</span>
				</div>
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Months</span>
					<span class="{statValueSizeClass(timeBreakdown.totalMonths)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.totalMonths.toLocaleString()}</span>
				</div>
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Weeks</span>
					<span class="{statValueSizeClass(timeBreakdown.totalWeeks)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.totalWeeks.toLocaleString()}</span>
				</div>
			</div>
			<div class="grid grid-cols-3 divide-x divide-foreground/10 text-center mt-3 pt-3 border-t border-foreground/5">
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Days</span>
					<span class="{statValueSizeClass(timeBreakdown.totalDays)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.totalDays.toLocaleString()}</span>
				</div>
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Hours</span>
					<span class="{statValueSizeClass(timeBreakdown.totalHours)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.totalHours.toLocaleString()}</span>
				</div>
				<div class="px-1 min-w-0 overflow-hidden">
					<span class="text-[9px] font-mono uppercase tracking-widest text-muted-foreground block truncate">Minutes</span>
					<span class="{statValueSizeClass(timeBreakdown.totalMinutes)} font-serif italic font-semibold text-foreground mt-0.5 block truncate tabular-nums">{timeBreakdown.totalMinutes.toLocaleString()}</span>
				</div>
			</div>
		</div>

		<!-- Editorial Milestone Line. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			{#if nextMilestone}
				<div class="border border-primary/20 bg-card/60 p-4 text-center">
					<div class="flex items-center justify-between text-xs font-mono uppercase tracking-wider mb-2 text-foreground">
						<span class="truncate font-semibold max-w-[200px]">{nextMilestone.milestone.title}</span>
						<span class="text-primary font-bold shrink-0">
							{#if nextMilestone.daysLeft === 0}
								Today
							{:else}
								in {nextMilestone.daysLeft}d
							{/if}
						</span>
					</div>

					<div class="w-full bg-foreground/10 h-1 overflow-hidden">
						<div
							class="bg-primary h-full transition-all duration-500"
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

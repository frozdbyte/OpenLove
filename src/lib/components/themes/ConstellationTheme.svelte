<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Settings, Share2, Sparkles, ChevronDown, Star, Sparkle } from '@lucide/svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import BondFallbackIcon from '$lib/components/themes/shared/BondFallbackIcon.svelte';
	import ThemeIconButton from '$lib/components/themes/shared/ThemeIconButton.svelte';
	import { createPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';
	import { statValueSizeClass } from '$lib/components/themes/shared/statValueSizeClass';

	let { profile, bond, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	const photoGuard = createPhotoRetryGuard(() => bond?.id, () => bond?.photoBlob);
</script>

<!-- Own sky-toned gradient (not the generic bg-background token) so the starfield
     stays legible against a dawn-sky palette in light mode and a night sky in dark
     mode, instead of white star dots disappearing against a plain light background. -->
<div class="relative min-h-svh w-full max-w-md mx-auto px-4 py-6 flex flex-col justify-between pb-12 overflow-hidden bg-gradient-to-b from-indigo-100 via-purple-50 to-background dark:from-indigo-950 dark:via-zinc-950 dark:to-black">
	<!-- Background Twinkling Starlight Particles (CSS Only) -->
	<div class="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
		<div class="absolute top-12 left-8 w-1 h-1 bg-indigo-950/60 dark:bg-white rounded-full animate-ping opacity-60"></div>
		<div class="absolute top-28 right-12 w-1.5 h-1.5 bg-primary/80 rounded-full animate-pulse opacity-75"></div>
		<div class="absolute top-1/3 left-1/4 w-1 h-1 bg-indigo-950/60 dark:bg-white rounded-full animate-pulse opacity-50"></div>
		<div class="absolute top-1/2 right-8 w-1 h-1 bg-primary/70 rounded-full animate-ping opacity-40"></div>
		<div class="absolute bottom-32 left-12 w-1.5 h-1.5 bg-indigo-950/60 dark:bg-white rounded-full animate-pulse opacity-70"></div>
		<div class="absolute bottom-16 right-16 w-1 h-1 bg-primary/60 rounded-full animate-ping opacity-50"></div>
	</div>

	<!-- Top Bar -->
	<header class="relative z-10 flex items-center justify-between py-2">
		<ThemeIconButton icon={Settings} onclick={onOpenSettings} ariaLabel="Settings" />

		<button
			type="button"
			class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold hover:bg-primary/20 transition-all cursor-pointer shadow-2xs"
			onclick={onOpenSwitcher}
			aria-label="Switch Relationship or Friendship"
		>
			<Star class="h-3.5 w-3.5 fill-primary text-primary animate-pulse" />
			<span>{isFriendship ? 'Constellation' : 'Orbiting Together'}</span>
			<ChevronDown class="h-3 w-3 opacity-60 ml-0.5" />
		</button>

		<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share" />
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="relative z-10 flex justify-center">
		<SyncStatusPill variant="modern" class="font-mono tracking-wide border-primary/25" />
	</div>

	<!-- Main Cosmic Content -->
	<main class="relative z-10 space-y-6 my-auto pt-2 pb-6">
		<!-- Glowing Lunar Avatar -->
		<div class="flex flex-col items-center text-center">
			<button
				type="button"
				class="relative group cursor-pointer focus:outline-hidden"
				onclick={onOpenSwitcher}
				aria-label="Switch bond"
			>
				<!-- Orbiting Halo Glow -->
				<div class="absolute -inset-2 rounded-full bg-gradient-to-tr from-primary/30 via-accent/30 to-primary/20 blur-lg group-hover:opacity-100 transition duration-500 animate-gentle-pulse"></div>

				<div class="relative h-32 w-32 rounded-full overflow-hidden border-2 border-primary/50 bg-card shadow-[0_0_25px_var(--primary-color)] flex items-center justify-center">
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
							containerClass="bg-gradient-to-br from-primary/20 via-background to-accent text-primary"
							iconClass={isFriendship ? 'h-14 w-14 text-primary' : 'h-14 w-14 fill-primary/20 stroke-primary'}
							caption={isFriendship ? 'Add friend photo' : 'Add couple photo'}
							captionClass="text-xs font-mono text-primary/80 mt-2"
						/>
					{/if}
				</div>

				<div class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-lg">
					<Sparkles class="h-4 w-4 fill-current" />
				</div>
			</button>

			<div class="mt-4">
				<h1 class="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-1.5">
					<span class="text-primary text-xs">✧</span>
					<span>{profile.names}</span>
					<span class="text-primary text-xs">✧</span>
				</h1>
				<p class="text-xs text-muted-foreground mt-0.5 font-mono">
					In orbit since {timeBreakdown.startDateFormatted}
				</p>
			</div>
		</div>

		<!-- Celestial Days Orbit Counter -->
		<div class="relative bg-card/85 dark:bg-card/50 border border-primary/25 rounded-3xl p-5 text-center shadow-[0_0_20px_var(--primary-color)]">
			<span class="text-[11px] font-mono tracking-widest uppercase text-primary font-semibold block">
				{isFriendship ? 'Solar Cycles of Friendship' : 'Rotations Around The Sun'}
			</span>

			<div class="mt-1 flex items-center justify-center gap-2">
				<span class="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-foreground to-primary bg-clip-text text-transparent">
					{timeBreakdown.totalDays.toLocaleString()}
				</span>
				<span class="text-xs font-mono text-muted-foreground self-end mb-1.5">days</span>
			</div>

			<p class="text-xs text-muted-foreground mt-1 font-mono">
				{timeBreakdown.primaryFormatted}
			</p>

			{#if profile.showSeconds}
				<div class="mt-2 pt-2 border-t border-primary/15 text-[11px] font-mono text-muted-foreground">
					<span class="font-bold text-foreground">{timeBreakdown.totalSeconds.toLocaleString()}</span> seconds
				</div>
			{/if}
		</div>

		<!-- Starlit Metric Tiles -->
		<div class="grid grid-cols-3 gap-2">
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Solar Yrs</span>
				<span class="{statValueSizeClass(timeBreakdown.years)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.years}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Moons</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMonths)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMonths.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Weeks</span>
				<span class="{statValueSizeClass(timeBreakdown.totalWeeks)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalWeeks.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Days</span>
				<span class="{statValueSizeClass(timeBreakdown.totalDays)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalDays.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Hours</span>
				<span class="{statValueSizeClass(timeBreakdown.totalHours)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalHours.toLocaleString()}</span>
			</div>
			<div class="bg-card/70 dark:bg-card/40 border border-primary/15 rounded-2xl p-2.5 text-center shadow-2xs min-w-0 overflow-hidden flex flex-col justify-between">
				<span class="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block truncate">Minutes</span>
				<span class="{statValueSizeClass(timeBreakdown.totalMinutes)} font-bold text-foreground truncate tabular-nums block mt-1">{timeBreakdown.totalMinutes.toLocaleString()}</span>
			</div>
		</div>

		<!-- Next Celestial Alignment. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			{#if nextMilestone}
				<div class="rounded-3xl bg-card/80 dark:bg-card/50 border border-primary/20 p-4 shadow-xs">
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-1.5 min-w-0 mr-2">
							<Sparkle class="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
							<span class="text-xs font-semibold text-foreground truncate">
								{nextMilestone.milestone.title}
							</span>
						</div>
						<span class="text-[11px] font-mono font-semibold text-primary px-2 py-0.5 bg-primary/15 rounded-full shrink-0">
							{#if nextMilestone.daysLeft === 0}
								Aligned today! ✦
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

					<div class="flex justify-between items-center text-[10px] font-mono text-muted-foreground mt-1.5">
						<span>Target: {nextMilestone.daysLeft}d left</span>
						<span>{nextMilestone.progressPercentage}%</span>
					</div>
				</div>
			{/if}
		{/key}
	</main>
</div>

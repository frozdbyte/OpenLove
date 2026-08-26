<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Heart, Settings, Share2, Sparkles, Trophy, Calendar, Clock, Hourglass } from '@lucide/svelte';
	import Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge';
	import Progress from '$lib/components/ui/progress';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';

	let { profile, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare }: ThemeProps = $props();
</script>

<div class="relative min-h-svh w-full flex flex-col justify-between pb-6 sm:pb-8 overflow-x-hidden bg-background">
	<!-- Full-Width Edge-to-Edge Cover Photo starting from top screen edge -->
	<div class="absolute inset-x-0 top-0 h-[58vh] min-h-[380px] max-h-[620px] max-w-full lg:max-w-lg  mx-auto overflow-hidden select-none z-0">
		{#if profile.photoUrl}
			<img
				src={profile.photoUrl}
				alt={profile.names}
				class="w-full h-full object-cover object-center"
			/>
		{:else}
			<div class="w-full h-full bg-gradient-to-br from-rose-200/50 via-primary/20 to-rose-300/40 dark:from-rose-950/50 dark:via-zinc-900 dark:to-zinc-950 flex flex-col items-center justify-center text-primary">
				<Heart class="h-16 w-16 fill-primary/20 stroke-primary animate-gentle-pulse" />
				<span class="text-xs font-medium text-muted-foreground mt-2">Add couple photo in settings</span>
			</div>
		{/if}

		<!-- Top Gradient: Seamlessly fades from header background to transparent without muddy dark bands -->
		<div class="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-background/85 via-background/40 to-background/0 pointer-events-none z-10"></div>

		<!-- Bottom Gradient: Perfectly matches the middle layout background (rose-50/background in light, zinc-900 in dark) -->
		<div class="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background via-background/60 to-background/0 pointer-events-none z-10"></div>
	</div>

	<!-- Top Bar Header with Names at the Top -->
	<div class="relative z-20 w-full max-w-md mx-auto px-4 pt-5 shrink-0">
		<header class="flex items-center justify-between py-1.5">
			<button
				type="button"
				class="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all border border-border/40 backdrop-blur-md cursor-pointer shrink-0"
				onclick={onOpenSettings}
				aria-label="Settings"
			>
				<Settings class="h-5 w-5" />
			</button>

			<div class="flex flex-col items-center text-center px-2 flex-1 min-w-0">
				<h1 class="text-base sm:text-lg font-extrabold text-foreground tracking-tight truncate max-w-full drop-shadow-xs">
					{profile.names}
				</h1>
				<p class="text-[11px] text-muted-foreground font-medium drop-shadow-xs">
					Since {timeBreakdown.startDateFormatted}
				</p>
			</div>

			<button
				type="button"
				class="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all border border-border/40 backdrop-blur-md cursor-pointer shrink-0"
				onclick={onOpenShare}
				aria-label="Share with Partner"
			>
				<Share2 class="h-5 w-5" />
			</button>
		</header>

		<!-- Offline / pending-sync indicator -->
		<div class="flex justify-center mt-0.5">
			<SyncStatusPill variant="modern" />
		</div>
	</div>

	<!-- Main Content Section pushed down towards bottom of viewport -->
	<main class="relative z-20 w-full max-w-md mx-auto px-4 space-y-3 mt-auto pt-[28vh] sm:pt-[34vh] pb-2">
		<!-- Sleek Compact Hero Counter Card to showcase more photo -->
		<Card class="border-primary/20 bg-card/85 backdrop-blur-xl shadow-lg text-center py-3 px-4 sm:py-3.5 sm:px-5 space-y-1">
			<Badge variant="romantic" class="mx-auto uppercase tracking-widest text-[9px] py-0.5 px-2">
				Together for
			</Badge>
			<h2 class="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight py-0.5">
				{timeBreakdown.primaryFormatted}
			</h2>
			{#if profile.showSeconds}
				<div class="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/40">
					<Clock class="h-3 w-3 text-primary animate-spin" style="animation-duration: 10s;" />
					<span>{timeBreakdown.totalSeconds.toLocaleString()} seconds</span>
				</div>
			{/if}
		</Card>

		<!-- Stacked Breakdown Cards -->
		<div class="grid grid-cols-2 gap-2.5">
			<Card class="p-3.5 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm backdrop-blur-md">
				<div class="p-2 rounded-2xl bg-primary/10 text-primary shrink-0">
					<Calendar class="h-4 w-4" />
				</div>
				<div class="text-left min-w-0">
					<div class="text-lg font-bold leading-none">{timeBreakdown.totalMonths.toLocaleString()}</div>
					<div class="text-[10px] text-muted-foreground font-medium mt-1">Months</div>
				</div>
			</Card>

			<Card class="p-3.5 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm backdrop-blur-md">
				<div class="p-2 rounded-2xl bg-primary/10 text-primary shrink-0">
					<Sparkles class="h-4 w-4" />
				</div>
				<div class="text-left min-w-0">
					<div class="text-lg font-bold leading-none">{timeBreakdown.totalWeeks.toLocaleString()}</div>
					<div class="text-[10px] text-muted-foreground font-medium mt-1">Weeks</div>
				</div>
			</Card>

			<Card class="p-3.5 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm backdrop-blur-md">
				<div class="p-2 rounded-2xl bg-primary/10 text-primary shrink-0">
					<Heart class="h-4 w-4" />
				</div>
				<div class="text-left min-w-0">
					<div class="text-lg font-bold leading-none">{timeBreakdown.totalDays.toLocaleString()}</div>
					<div class="text-[10px] text-muted-foreground font-medium mt-1">Days</div>
				</div>
			</Card>

			<Card class="p-3.5 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm backdrop-blur-md">
				<div class="p-2 rounded-2xl bg-primary/10 text-primary shrink-0">
					<Hourglass class="h-4 w-4" />
				</div>
				<div class="text-left min-w-0">
					<div class="text-lg font-bold leading-none">{timeBreakdown.totalHours.toLocaleString()}</div>
					<div class="text-[10px] text-muted-foreground font-medium mt-1">Hours</div>
				</div>
			</Card>
		</div>

		<!-- Next Milestone Progress Bar -->
		{#if nextMilestone}
			<Card class="p-4 bg-card/85 border-border/60 shadow-sm backdrop-blur-md space-y-2.5">
				<div class="flex items-center justify-between text-xs">
					<div class="flex items-center gap-1.5 font-semibold text-foreground">
						<Trophy class="h-4 w-4 text-primary shrink-0" />
						<span class="truncate">Next Milestone: {nextMilestone.milestone.title}</span>
					</div>
					<span class="text-muted-foreground font-medium shrink-0 ml-2">in {nextMilestone.daysLeft} {nextMilestone.daysLeft === 1 ? 'day' : 'days'}</span>
				</div>
				<Progress value={nextMilestone.progressPercentage} max={100} />
				<div class="flex justify-between text-[11px] text-muted-foreground">
					<span>Progress</span>
					<span class="font-semibold text-foreground">{nextMilestone.progressPercentage}%</span>
				</div>
			</Card>
		{/if}
	</main>
</div>

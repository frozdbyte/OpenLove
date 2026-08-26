<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Heart, Settings, Share2, Sparkles, Trophy, Calendar, Clock, Hourglass } from '@lucide/svelte';
	import Card, { CardContent } from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge';
	import Progress from '$lib/components/ui/progress';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';

	let { profile, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare }: ThemeProps = $props();
</script>

<div class="relative min-h-svh w-full max-w-md mx-auto px-4 py-6 flex flex-col justify-between pb-12">
	<!-- Top Bar -->
	<header class="flex items-center justify-between py-2">
		<button
			type="button"
			class="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all border border-border/40 backdrop-blur-md cursor-pointer"
			onclick={onOpenSettings}
			aria-label="Settings"
		>
			<Settings class="h-5 w-5" />
		</button>

		<div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
			<Heart class="h-3.5 w-3.5 fill-primary animate-heartbeat" />
			<span>Together</span>
		</div>

		<button
			type="button"
			class="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all border border-border/40 backdrop-blur-md cursor-pointer"
			onclick={onOpenShare}
			aria-label="Share with Partner"
		>
			<Share2 class="h-5 w-5" />
		</button>
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="flex justify-center">
		<SyncStatusPill variant="modern" />
	</div>

	<!-- Main Content Section -->
	<main class="space-y-6 my-auto pt-4 pb-6">
		<!-- Couple Avatar & Names -->
		<div class="flex flex-col items-center text-center space-y-3">
			<div class="relative group">
				<div class="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-primary to-rose-400 opacity-60 blur-md group-hover:opacity-100 transition duration-500 animate-gentle-pulse"></div>
				
				<div class="relative h-28 w-28 rounded-full overflow-hidden border-4 border-background bg-card shadow-xl flex items-center justify-center">
					{#if profile.photoUrl}
						<img
							src={profile.photoUrl}
							alt={profile.names}
							class="h-full w-full object-cover"
						/>
					{:else}
						<div class="h-full w-full bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/60 dark:to-zinc-900 flex items-center justify-center text-primary">
							<Heart class="h-12 w-12 fill-primary/30 stroke-primary animate-heartbeat" />
						</div>
					{/if}
				</div>

				<div class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-lg">
					<Heart class="h-4 w-4 fill-current" />
				</div>
			</div>

			<div>
				<h1 class="text-2xl font-extrabold text-foreground tracking-tight">
					{profile.names}
				</h1>
				<p class="text-xs text-muted-foreground mt-0.5 font-medium">
					Since {timeBreakdown.startDateFormatted}
				</p>
			</div>
		</div>

		<!-- Big Hero Counter Card -->
		<Card class="border-primary/20 bg-gradient-to-b from-card/90 to-card/60 shadow-lg text-center p-6 space-y-2">
			<Badge variant="romantic" class="mx-auto uppercase tracking-widest text-[10px]">
				Together for
			</Badge>
			<h2 class="text-3xl font-black text-primary tracking-tight py-1">
				{timeBreakdown.primaryFormatted}
			</h2>
			{#if profile.showSeconds}
				<div class="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/60 px-3 py-1 rounded-full border border-border/40">
					<Clock class="h-3 w-3 text-primary animate-spin" style="animation-duration: 10s;" />
					<span>{timeBreakdown.totalSeconds.toLocaleString()} seconds</span>
				</div>
			{/if}
		</Card>

		<!-- Stacked Breakdown Cards -->
		<div class="grid grid-cols-2 gap-3">
			<Card class="p-4 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm">
				<div class="p-2.5 rounded-2xl bg-primary/10 text-primary">
					<Calendar class="h-5 w-5" />
				</div>
				<div class="text-left">
					<div class="text-xl font-bold leading-none">{timeBreakdown.totalMonths.toLocaleString()}</div>
					<div class="text-[11px] text-muted-foreground font-medium mt-1">Months</div>
				</div>
			</Card>

			<Card class="p-4 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm">
				<div class="p-2.5 rounded-2xl bg-primary/10 text-primary">
					<Sparkles class="h-5 w-5" />
				</div>
				<div class="text-left">
					<div class="text-xl font-bold leading-none">{timeBreakdown.totalWeeks.toLocaleString()}</div>
					<div class="text-[11px] text-muted-foreground font-medium mt-1">Weeks</div>
				</div>
			</Card>

			<Card class="p-4 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm">
				<div class="p-2.5 rounded-2xl bg-primary/10 text-primary">
					<Heart class="h-5 w-5" />
				</div>
				<div class="text-left">
					<div class="text-xl font-bold leading-none">{timeBreakdown.totalDays.toLocaleString()}</div>
					<div class="text-[11px] text-muted-foreground font-medium mt-1">Days</div>
				</div>
			</Card>

			<Card class="p-4 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm">
				<div class="p-2.5 rounded-2xl bg-primary/10 text-primary">
					<Hourglass class="h-5 w-5" />
				</div>
				<div class="text-left">
					<div class="text-xl font-bold leading-none">{timeBreakdown.totalHours.toLocaleString()}</div>
					<div class="text-[11px] text-muted-foreground font-medium mt-1">Hours</div>
				</div>
			</Card>
		</div>

		<!-- Next Milestone Progress Bar -->
		{#if nextMilestone}
			<Card class="p-5 bg-card/85 border-border/60 shadow-sm space-y-3">
				<div class="flex items-center justify-between text-xs">
					<div class="flex items-center gap-1.5 font-semibold text-foreground">
						<Trophy class="h-4 w-4 text-primary" />
						<span>Next Milestone: {nextMilestone.milestone.title}</span>
					</div>
					<span class="text-muted-foreground font-medium">in {nextMilestone.daysLeft} {nextMilestone.daysLeft === 1 ? 'day' : 'days'}</span>
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

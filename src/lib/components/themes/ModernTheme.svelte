<script lang="ts">
	import type { ThemeProps } from '$lib/types/profile';
	import { Heart, Settings, Share2, Sparkles, ChevronDown } from '@lucide/svelte';
	import { profileStore } from '$lib/stores/profile.svelte';
	import SyncStatusPill from '$lib/components/offline/SyncStatusPill.svelte';
	import ThemeIconButton from '$lib/components/themes/shared/ThemeIconButton.svelte';
	import HeroCounterCard from '$lib/components/themes/shared/HeroCounterCard.svelte';
	import StatBreakdownGrid from '$lib/components/themes/shared/StatBreakdownGrid.svelte';
	import NextMilestoneCard from '$lib/components/themes/shared/NextMilestoneCard.svelte';

	let { profile, bond, timeBreakdown, nextMilestone, onOpenSettings, onOpenShare, onOpenSwitcher }: ThemeProps = $props();

	let isFriendship = $derived(bond?.type === 'friendship');

	// See `profileStore.regeneratePhotoUrl`'s doc comment: an `<img>` can fail to
	// load a `photoUrl` that looks valid after the app sits backgrounded a
	// while, possibly more than once per session. `photoRegenAttempted` guards
	// against looping against a genuinely corrupt Blob — it blocks retrying
	// again until the regenerated URL actually loads (`handlePhotoLoad`), not
	// just until the Blob itself changes (bond switch, new upload).
	let photoRegenAttempted = $state(false);
	$effect(() => {
		bond?.photoBlob;
		photoRegenAttempted = false;
	});
	function handlePhotoError() {
		if (photoRegenAttempted || !bond?.photoBlob) return;
		photoRegenAttempted = true;
		profileStore.regeneratePhotoUrl(bond.id);
	}
	function handlePhotoLoad() {
		photoRegenAttempted = false;
	}
</script>

<div class="relative min-h-svh w-full max-w-md mx-auto px-4 py-6 flex flex-col justify-between pb-12">
	<!-- Top Bar -->
	<header class="flex items-center justify-between py-2">
		<ThemeIconButton icon={Settings} onclick={onOpenSettings} ariaLabel="Settings" />

		<button
			type="button"
			class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all cursor-pointer"
			onclick={onOpenSwitcher}
			aria-label="Switch Relationship or Friendship"
		>
			{#if isFriendship}
				<Sparkles class="h-3.5 w-3.5 fill-primary" />
				<span>Friends</span>
			{:else}
				<Heart class="h-3.5 w-3.5 fill-primary animate-heartbeat" />
				<span>Together</span>
			{/if}
			<ChevronDown class="h-3 w-3 opacity-60 ml-0.5" />
		</button>

		<ThemeIconButton icon={Share2} onclick={onOpenShare} ariaLabel="Share with Partner" />
	</header>

	<!-- Offline / pending-sync indicator -->
	<div class="flex justify-center">
		<SyncStatusPill variant="modern" />
	</div>

	<!-- Main Content Section -->
	<main class="space-y-6 my-auto pt-4 pb-6">
		<!-- Couple Avatar & Names -->
		<div class="flex flex-col items-center text-center space-y-3">
			<button
				type="button"
				class="relative group cursor-pointer"
				onclick={onOpenSwitcher}
				aria-label="Switch bond"
			>
				<div class="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-primary to-rose-400 opacity-60 blur-md group-hover:opacity-100 transition duration-500 animate-gentle-pulse"></div>
				
				<div class="relative h-28 w-28 rounded-full overflow-hidden border-4 border-background bg-card shadow-xl flex items-center justify-center">
					{#if profile.photoUrl}
						<img
							src={profile.photoUrl}
							alt={profile.names}
							class="h-full w-full object-cover"
							onerror={handlePhotoError}
							onload={handlePhotoLoad}
						/>
					{:else if isFriendship}
						<div class="h-full w-full bg-gradient-to-br from-emerald-100 to-teal-200 dark:from-emerald-950/60 dark:to-zinc-900 flex items-center justify-center text-primary">
							<Sparkles class="h-12 w-12" />
						</div>
					{:else}
						<div class="h-full w-full bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-950/60 dark:to-zinc-900 flex items-center justify-center text-primary">
							<Heart class="h-12 w-12 fill-primary/30 stroke-primary animate-heartbeat" />
						</div>
					{/if}
				</div>

				<div class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-lg">
					{#if isFriendship}
						<Sparkles class="h-4 w-4 fill-current" />
					{:else}
						<Heart class="h-4 w-4 fill-current" />
					{/if}
				</div>
			</button>

			<button
				type="button"
				class="group flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity"
				onclick={onOpenSwitcher}
			>
				<div class="flex items-center gap-1.5">
					<h1 class="text-2xl font-extrabold text-foreground tracking-tight">
						{profile.names}
					</h1>
					<ChevronDown class="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
				</div>
				<p class="text-xs text-muted-foreground mt-0.5 font-medium">
					{isFriendship ? 'Friends since' : 'Since'} {timeBreakdown.startDateFormatted}
				</p>
			</button>
		</div>

		<!-- Big Hero Counter Card -->
		<HeroCounterCard
			{isFriendship}
			primaryFormatted={timeBreakdown.primaryFormatted}
			totalSeconds={timeBreakdown.totalSeconds}
			showSeconds={profile.showSeconds}
			variant="default"
		/>

		<!-- Stacked Breakdown Cards -->
		<StatBreakdownGrid
			{isFriendship}
			totalMonths={timeBreakdown.totalMonths}
			totalWeeks={timeBreakdown.totalWeeks}
			totalDays={timeBreakdown.totalDays}
			totalHours={timeBreakdown.totalHours}
			variant="default"
		/>

		<!-- Next Milestone Progress Bar. Keyed on bond id so switching bonds remounts
		     the bar instead of CSS-transitioning its width from the previous bond's
		     unrelated percentage — see Progress.svelte's `transition-all`. -->
		{#key bond?.id}
			<NextMilestoneCard {nextMilestone} variant="default" />
		{/key}
	</main>
</div>

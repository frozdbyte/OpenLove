<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { calculateTimeBreakdown, calculateMilestones } from '$lib/utils/time';
	import { getThemeComponent } from '$lib/components/themes/registry';
	import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
	import ShareModal from '$lib/components/share/ShareModal.svelte';
	import { Heart } from '@lucide/svelte';
	import Button from '$lib/components/ui/button';

	let isSettingsOpen = $state(false);
	let isShareOpen = $state(false);
	let currentTime = $state(new Date());

	// Update live clock every second
	$effect(() => {
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		return () => clearInterval(interval);
	});

	// Handle Partner Share URL import if present in hash (#import=...)
	$effect(() => {
		if (typeof window !== 'undefined' && window.location.hash.startsWith('#import=')) {
			try {
				const raw = decodeURIComponent(window.location.hash.replace('#import=', ''));
				const json = atob(raw);
				profileStore.importJSON(json).then((success) => {
					if (success) {
						window.history.replaceState(null, '', window.location.pathname);
					}
				});
			} catch (err) {
				console.error('Failed to parse share hash:', err);
			}
		}
	});

	let timeBreakdown = $derived(
		calculateTimeBreakdown(profileStore.profile.togetherSince, currentTime)
	);

	let milestoneData = $derived(
		calculateMilestones(
			profileStore.profile.togetherSince,
			profileStore.profile.customMilestones,
			currentTime
		)
	);

	let CurrentThemeComponent = $derived(getThemeComponent(profileStore.profile.uiTheme));
</script>

<svelte:head>
	<title>{profileStore.profile.names} - OpenLove</title>
</svelte:head>

{#if profileStore.isLoading}
	<!-- Splash / Loading screen -->
	<div class="min-h-screen flex flex-col items-center justify-center space-y-4">
		<div class="h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary animate-heartbeat shadow-lg">
			<Heart class="h-8 w-8 fill-primary" />
		</div>
		<p class="text-sm font-serif text-muted-foreground animate-pulse">Loading your memories...</p>
	</div>
{:else if !profileStore.profile.isConfigured}
	<!-- First-run placeholder until Stage 4 onboarding is loaded -->
	<div class="min-h-screen flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-6">
		<div class="h-20 w-20 rounded-full bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-primary shadow-xl">
			<Heart class="h-10 w-10 fill-primary animate-heartbeat" />
		</div>
		<div class="space-y-2">
			<h1 class="text-3xl font-bold font-serif text-foreground">Welcome to OpenLove</h1>
			<p class="text-sm text-muted-foreground">A private, self-hosted tracker to celebrate your time together.</p>
		</div>
		<Button class="w-full" size="lg" onclick={() => (isSettingsOpen = true)}>
			Setup Your Counter
		</Button>
	</div>
{:else}
	<!-- Active UI Theme Rendered Dynamically -->
	<CurrentThemeComponent
		profile={profileStore.profile}
		{timeBreakdown}
		nextMilestone={milestoneData.nextMilestone}
		milestones={milestoneData.milestones}
		onOpenSettings={() => (isSettingsOpen = true)}
		onOpenShare={() => (isShareOpen = true)}
	/>
{/if}

<!-- Modals & Sheets -->
<SettingsSheet
	bind:open={isSettingsOpen}
	milestones={milestoneData.milestones}
	onclose={() => (isSettingsOpen = false)}
/>

<ShareModal
	bind:open={isShareOpen}
	onclose={() => (isShareOpen = false)}
/>

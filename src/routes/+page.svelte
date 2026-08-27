<script lang="ts">
	import { profileStore, parseSharePayload } from '$lib/stores/profile.svelte';
	import { calculateTimeBreakdown, calculateMilestones } from '$lib/utils/time';
	import { getThemeComponent } from '$lib/components/themes/registry';
	import { isRunningAsPWA } from '$lib/utils/pwa';
	import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
	import ShareModal from '$lib/components/share/ShareModal.svelte';
	import PartnerInviteModal from '$lib/components/share/PartnerInviteModal.svelte';
	import BondSwitcherDrawer from '$lib/components/bonds/BondSwitcherDrawer.svelte';
	import OnboardingFlow from '$lib/components/onboarding/OnboardingFlow.svelte';
	import type { Bond } from '$lib/types/bonds';
	import { Heart } from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import { decodeSharePayloadString } from '$lib/utils/share';

	let isSettingsOpen = $state(false);
	let isShareOpen = $state(false);
	let isInviteModalOpen = $state(false);
	let isSwitcherOpen = $state(false);
	let pendingIncomingBond = $state<Partial<Bond> | null>(null);
	let pendingInviteJson = $state('');
	let pendingInviteRaw = $state('');
	let pendingPartnerNames = $state('');
	let currentTime = $state(new Date());
	let locale: string | undefined = $state();

	// Update live clock every second
	$effect(() => {
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		return () => clearInterval(interval);
	});

	// Handle URL query parameter `?bond=id` and Service Worker switch messages
	$effect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			const targetBond = params.get('bond');
			if (targetBond && profileStore.isInitialized) {
				void profileStore.setActiveBond(targetBond);
			}

			const handleMessage = (e: MessageEvent) => {
				if (e.data?.type === 'OPENLOVE_SWITCH_BOND' && e.data?.bondId) {
					void profileStore.setActiveBond(e.data.bondId);
				}
			};
			navigator.serviceWorker?.addEventListener('message', handleMessage);
			return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
		}
	});

	// Handle Partner Share URL import if present in hash (#import=...)
	$effect(() => {
		if (typeof window !== 'undefined' && window.location.hash.startsWith('#import=')) {
			try {
				const encoded = window.location.hash.replace('#import=', '');
				const raw = decodeURIComponent(encoded);
				const parsed = parseSharePayload(raw);
				const json = decodeSharePayloadString(raw);

				pendingInviteJson = json;
				pendingInviteRaw = raw;
				pendingIncomingBond = parsed;
				pendingPartnerNames = parsed?.names || 'Your Partner';

				const isStandalone = isRunningAsPWA();
				if (isStandalone && !profileStore.state.isConfigured) {
					// Only auto-import silently if user hasn't configured any bond yet
					profileStore.importJSON(json, 'replace').then((success) => {
						if (success) {
							window.history.replaceState(null, '', window.location.pathname);
							confetti({
								particleCount: 120,
								spread: 70,
								origin: { y: 0.6 }
							});
						}
					});
				} else {
					// Show smart preview & resolution modal (Case A: unconfigured, Case B: 1 bond replace/add, Case C: multi bond add)
					isInviteModalOpen = true;
				}
			} catch (err) {
				console.error('Failed to parse share hash:', err);
			}
		}
	});

	$effect(() => {
		if (typeof window !== 'undefined') {
			locale = navigator.language;
		}
	});

	async function handleAcceptInvite(mode: 'replace' | 'add') {
		if (pendingInviteJson) {
			await profileStore.importJSON(pendingInviteJson, mode);
			window.history.replaceState(null, '', window.location.pathname);
			isInviteModalOpen = false;
			if (typeof window !== 'undefined') {
				confetti({
					particleCount: 120,
					spread: 70,
					origin: { y: 0.6 }
				});
			}
		}
	}


	let timeBreakdown = $derived(
		calculateTimeBreakdown(profileStore.activeBond.togetherSince, currentTime, locale)
	);

	let milestoneData = $derived(
		calculateMilestones(
			profileStore.activeBond.togetherSince,
			profileStore.activeBond.customMilestones,
			currentTime,
			profileStore.activeBond.milestonePrefs
		)
	);

	let CurrentThemeComponent = $derived(getThemeComponent(profileStore.profile.uiTheme));

</script>

<svelte:head>
	<title>Open Love</title>
</svelte:head>

{#if profileStore.isLoading}
	<!-- Splash / Loading screen -->
	<div class="min-h-screen flex flex-col items-center justify-center space-y-4">
		<div class="h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary animate-heartbeat shadow-lg">
			<Heart class="h-8 w-8 fill-primary" />
		</div>
		<p class="text-sm font-medium text-muted-foreground animate-pulse">Loading your memories...</p>
	</div>
{:else if !profileStore.state.isConfigured}
	<!-- Onboarding Setup Wizard on first run -->
	<OnboardingFlow />
{:else}
	<!-- Active UI Theme Rendered Dynamically -->
	<CurrentThemeComponent
		profile={profileStore.profile}
		bond={profileStore.activeBond}
		{timeBreakdown}
		nextMilestone={milestoneData.nextMilestone}
		milestones={milestoneData.milestones}
		onOpenSettings={() => (isSettingsOpen = true)}
		onOpenShare={() => (isShareOpen = true)}
		onOpenSwitcher={() => (isSwitcherOpen = true)}
	/>
{/if}

<!-- Modals & Sheets -->
<SettingsSheet
	bind:open={isSettingsOpen}
	showAppWideSettings={true}
	targetBondId={null}
	onOpenSwitcher={() => {
		isSettingsOpen = false;
		isSwitcherOpen = true;
	}}
	onclose={() => (isSettingsOpen = false)}
/>


<ShareModal
	bind:open={isShareOpen}
	onclose={() => (isShareOpen = false)}
/>

<BondSwitcherDrawer
	bind:open={isSwitcherOpen}
	onclose={() => (isSwitcherOpen = false)}
/>

<PartnerInviteModal
	bind:open={isInviteModalOpen}
	incomingBond={pendingIncomingBond}
	partnerNames={pendingPartnerNames}
	importRaw={pendingInviteRaw}
	onAccept={handleAcceptInvite}
	onclose={() => {
		isInviteModalOpen = false;
	}}
/>


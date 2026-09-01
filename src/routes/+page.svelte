<script lang="ts">
	import { profileStore, parseSharePayload } from '$lib/stores/profile.svelte';
	import { calculateTimeBreakdown, calculateMilestones } from '$lib/utils/time';
	import { getThemeComponent } from '$lib/components/themes/registry';
	import { isRunningAsPWA } from '$lib/utils/pwa';
	import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';
	import ShareModal, { type ShareHubView } from '$lib/components/share/ShareModal.svelte';
	import PartnerInviteModal from '$lib/components/share/PartnerInviteModal.svelte';
	import BondSwitcherDrawer from '$lib/components/bonds/BondSwitcherDrawer.svelte';
	import BondPhotoPreloader from '$lib/components/bonds/BondPhotoPreloader.svelte';
	import OnboardingFlow from '$lib/components/onboarding/OnboardingFlow.svelte';
	import EnableNotificationsPrompt from '$lib/components/onboarding/EnableNotificationsPrompt.svelte';
	import MilestoneCelebrationController from '$lib/components/celebration/MilestoneCelebrationController.svelte';
	import { makePushMilestoneItem } from '$lib/utils/celebration';
	import type { SWCelebrationMessage } from '$lib/types/time';
	import { isPushSupported } from '$lib/push/client';
	import type { Bond } from '$lib/types/bonds';
	import Button from '$lib/components/ui/button';
	import { Heart } from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import { decodeSharePayloadString, detectFullBackup } from '$lib/utils/share';

	let isSettingsOpen = $state(false);
	let isShareOpen = $state(false);
	let shareInitialView = $state<ShareHubView>('menu');
	let isInviteModalOpen = $state(false);
	let isSwitcherOpen = $state(false);
	let isNotificationsPromptOpen = $state(false);
	let pendingIncomingBond = $state<Partial<Bond> | null>(null);
	let pendingInviteJson = $state('');
	let pendingInviteRaw = $state('');
	let pendingPartnerNames = $state('');
	let currentTime = $state(new Date());
	let locale: string | undefined = $state();

	let celebrationController: MilestoneCelebrationController | undefined = $state();

	// Update live clock every second
	$effect(() => {
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 1000);

		return () => clearInterval(interval);
	});

	// One-time "Enable Notifications?" prompt: only ever flips `open` from
	// false to true (never back), and once `notificationsPromptShown` is set
	// the condition can never be true again — no reset-loop risk since
	// nothing else shares this effect. Delayed a few seconds so the user sees
	// their finished setup first, rather than being prompted the instant
	// onboarding ends.
	$effect(() => {
		if (
			profileStore.state.isConfigured &&
			!profileStore.state.pushSubscribed &&
			!profileStore.state.pushIntent &&
			!profileStore.state.notificationsPromptShown &&
			isPushSupported()
		) {
			const timer = setTimeout(() => {
				isNotificationsPromptOpen = true;
			}, 3000);
			return () => clearTimeout(timer);
		}
	});

	// Handle URL query parameter `?bond=id&celebrate=title` and Service Worker switch messages
	$effect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			const targetBond = params.get('bond');
			const celebrateTitle = params.get('celebrate');

			// Clean stale ?celebrate param even if no ?bond is present
			if (celebrateTitle && !targetBond) {
				window.history.replaceState(null, '', window.location.pathname);
			}

			if (targetBond && profileStore.isInitialized) {
				void profileStore.setActiveBond(targetBond).then(() => {
					if (celebrateTitle) {
						const bond = profileStore.activeBond;
						const milestone = makePushMilestoneItem(celebrateTitle);
						celebrationController?.triggerCelebration(bond, milestone);
						window.history.replaceState(null, '', window.location.pathname);
					}
				});
			}

			const handleMessage = (e: MessageEvent<SWCelebrationMessage>) => {
				if (e.data?.type === 'OPENLOVE_SWITCH_BOND' && e.data?.bondId) {
					void profileStore.setActiveBond(e.data.bondId).then(() => {
						if (e.data.celebrate) {
							const bond = profileStore.activeBond;
							const milestone = makePushMilestoneItem(
								e.data.celebrate,
								e.data.milestoneId || 'push_celebrate',
								e.data.milestoneType || 'years'
							);
							celebrationController?.triggerCelebration(bond, milestone);
						}
					});
				}
			};
			navigator.serviceWorker?.addEventListener('message', handleMessage);
			return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
		}
	});

	async function completeHashImport(json: string, mode: 'replace' | 'add') {
		const success = await profileStore.importJSON(json, mode);
		if (success) {
			window.history.replaceState(null, '', window.location.pathname);
			confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
		}
		return success;
	}

	// This effect reads `profileStore.state.isConfigured`, and every import path below
	// eventually sets that to `true` — which re-triggers the effect while the hash may
	// still be present (import is async; the hash is only cleared after it resolves).
	// Without this guard, that re-entrant run would reprocess the same hash a second
	// time: redundantly re-importing it, or — for the full-backup branch — popping a
	// second, spurious "this will replace everything" confirm for an import that
	// already completed. Track the exact hash already being (or having been) handled so
	// a re-entrant run for the *same* hash is a no-op; a genuinely new share link still
	// gets a fresh run.
	let handledImportHash: string | null = null;

	async function handleImportHash(hash: string) {
		// AGENTS.md Invariant 8: never act on profile state before IndexedDB has been
		// read. This effect can run on the very first tick, before `profileStore.init()`
		// (kicked off from its constructor) resolves. Importing before that point is
		// worse than a stale read — it's a write race: `init()`'s `this.state = loaded`
		// would land *after* an import that ran ahead of it and silently overwrite the
		// freshly-imported data with whatever (or nothing) was already on disk. This was
		// reachable before Phase 7 too (the standalone-auto-import branch below has
		// always called `importJSON` without awaiting `ready` first), just narrower —
		// the full-backup branch's unconditional direct-import made it easy to hit in
		// testing, which is how it surfaced.
		await profileStore.ready;

		try {
			// decodeSharePayloadString()/parseSharePayload() both detect and strip
			// whichever '#share'/'#import' wrapper is present internally, so the
			// full hash can be passed straight through — `raw` (kept as the hash
			// itself, not a pre-stripped form) also doubles as the pasteable sync
			// code shown via `pendingInviteRaw`, mirroring ScanImportModal.svelte's
			// own `pendingRaw` (the original scanned/pasted value, unprocessed).
			const raw = hash;
			const json = await decodeSharePayloadString(raw);

			// A full multi-bond backup needs different handling than a single-bond
			// invite: it can't be previewed as "one incoming bond", and importing it
			// always replaces the device's entire local state (see detectFullBackup's
			// doc comment) — so it never goes through the Add-as-New/Replace-Current
			// invite flow below, whose buttons would otherwise silently wipe every
			// bond already on this device instead of adding one.
			const fullBackup = detectFullBackup(json);
			if (fullBackup) {
				if (!profileStore.state.isConfigured) {
					// Nothing to lose yet.
					await completeHashImport(json, 'replace');
					return;
				}
				const { bondCount } = fullBackup;
				const confirmed = confirm(
					`This link contains a full backup with ${bondCount} relationship${bondCount === 1 ? '' : 's'}/friendship${bondCount === 1 ? '' : 's'}. Importing it will replace ALL bonds currently on this device — this cannot be undone unless you have your own backup. Continue?`
				);
				if (confirmed) {
					await completeHashImport(json, 'replace');
				}
				// Declined: leave the hash in place, matching the single-bond invite
				// flow's existing behavior when its modal is closed without accepting.
				return;
			}

			const parsed = await parseSharePayload(raw);

			pendingInviteJson = json;
			pendingInviteRaw = raw;
			pendingIncomingBond = parsed;
			pendingPartnerNames = parsed?.names || 'Your Partner';

			const isStandalone = isRunningAsPWA();
			if (isStandalone && !profileStore.state.isConfigured) {
				// Only auto-import silently if user hasn't configured any bond yet
				await completeHashImport(json, 'replace');
			} else {
				// Show smart preview & resolution modal (Case A: unconfigured, Case B: 1 bond replace/add, Case C: multi bond add)
				isInviteModalOpen = true;
			}
		} catch (err) {
			console.error('Failed to parse share hash:', err);
		}
	}

	// Handle Partner Share URL import if present in hash (#share-... current;
	// #import-..., #import/..., and #import=... are all legacy, still accepted).
	$effect(() => {
		if (
			typeof window !== 'undefined' &&
			(window.location.hash.startsWith('#share-') ||
				window.location.hash.startsWith('#import-') ||
				window.location.hash.startsWith('#import/') ||
				window.location.hash.startsWith('#import='))
		) {
			const hash = window.location.hash;
			if (hash === handledImportHash) return;
			handledImportHash = hash;
			void handleImportHash(hash);
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
		<div class="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-primary animate-heartbeat shadow-lg">
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
		onOpenShare={() => {
			shareInitialView = 'menu';
			isShareOpen = true;
		}}
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
	initialView={shareInitialView}
	onclose={() => (isShareOpen = false)}
/>

<BondSwitcherDrawer
	bind:open={isSwitcherOpen}
	onclose={() => (isSwitcherOpen = false)}
/>

<BondPhotoPreloader />

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

<EnableNotificationsPrompt bind:open={isNotificationsPromptOpen} />

<MilestoneCelebrationController
	bind:this={celebrationController}
	onShare={(view) => {
		shareInitialView = view;
		isShareOpen = true;
	}}
/>


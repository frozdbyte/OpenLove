<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { Bond } from '$lib/types/bonds';
	import type { MilestoneItem } from '$lib/types/time';
	import {
		getTodayMilestoneForBond,
		hasCelebratedMilestoneToday,
		markCelebratedMilestoneToday
	} from '$lib/utils/celebration';
	import {
		isDevMode,
		getQueuedDevMilestone,
		clearQueuedDevMilestone,
		SIMULATED_BOND
	} from '$lib/utils/dev';
	import MilestoneCelebrationModal from './MilestoneCelebrationModal.svelte';
	import MilestoneCelebrationToast from './MilestoneCelebrationToast.svelte';
	import DevToolsHub from '$lib/components/dev/DevToolsHub.svelte';
	import Button from '$lib/components/ui/button';

	interface Props {
		onShare: (view: 'progress') => void;
	}

	let { onShare }: Props = $props();

	let isCelebrationModalOpen = $state(false);
	let celebratingBond = $state<Bond>(profileStore.activeBond);
	let celebratingMilestone = $state<MilestoneItem | null>(null);

	let isCelebrationToastOpen = $state(false);
	let toastBond = $state<Bond | null>(null);
	let toastMilestone = $state<MilestoneItem | null>(null);

	let undoToastOpen = $state(false);
	let undoBondId = $state<string | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;

	let lastCheckedBondId = $state<string | null>(null);

	/**
	 * Trigger celebration modal for a specific bond and milestone (e.g. from Push Notification click).
	 */
	export function triggerCelebration(bond: Bond, milestone: MilestoneItem) {
		if (profileStore.state.autoCelebrateMilestones === false) return;
		if (bond.autoCelebrateMilestones === false) return;
		celebratingBond = bond;
		celebratingMilestone = milestone;
		isCelebrationModalOpen = true;
	}

	async function checkMilestonesOnOpen() {
		await profileStore.ready;
		if (!profileStore.state.isConfigured) return;

		// 0. Dev Queue check (for testing next app launch / reload behavior)
		if (isDevMode()) {
			const queued = getQueuedDevMilestone();
			if (queued) {
				clearQueuedDevMilestone();
				const target =
					queued.bondId === SIMULATED_BOND.id
						? SIMULATED_BOND
						: (queued.bondId && profileStore.state.bonds.find((b) => b.id === queued.bondId)) ||
							profileStore.activeBond;

				if (queued.mode === 'toast') {
					toastBond = target;
					toastMilestone = queued.milestone;
					isCelebrationToastOpen = true;
				} else {
					celebratingBond = target;
					celebratingMilestone = queued.milestone;
					isCelebrationModalOpen = true;
				}
				return;
			}
		}

		// If celebration cards are globally disabled, do not auto-popup
		if (profileStore.state.autoCelebrateMilestones === false) return;

		const active = profileStore.activeBond;
		lastCheckedBondId = active.id;

		// 1. Check active bond
		if (active.autoCelebrateMilestones !== false) {
			const m = getTodayMilestoneForBond(active);
			if (m && !hasCelebratedMilestoneToday(active.id, m.id)) {
				celebratingBond = active;
				celebratingMilestone = m;
				isCelebrationModalOpen = true;
				markCelebratedMilestoneToday(active.id, m.id);
				return;
			}
		}

		// 2. If active bond has no celebration today, check secondary bonds for launch toast
		for (const bond of profileStore.state.bonds) {
			if (bond.id === active.id) continue;
			if (bond.autoCelebrateMilestones === false) continue;
			const m = getTodayMilestoneForBond(bond);
			if (m && !hasCelebratedMilestoneToday(bond.id, m.id)) {
				toastBond = bond;
				toastMilestone = m;
				isCelebrationToastOpen = true;
				break;
			}
		}
	}

	$effect(() => {
		// Runs once on mount — must remain dependency-free.
		// profileStore.ready ensures we never read bonds before IndexedDB loads (AGENTS.md Invariant 8).
		checkMilestonesOnOpen().catch(console.error);
	});

	// Re-check whenever the active bond switches
	$effect(() => {
		const currentActive = profileStore.activeBond;
		if (lastCheckedBondId && currentActive.id !== lastCheckedBondId) {
			lastCheckedBondId = currentActive.id;
			if (
				profileStore.state.autoCelebrateMilestones !== false &&
				currentActive.autoCelebrateMilestones !== false
			) {
				const m = getTodayMilestoneForBond(currentActive);
				if (m && !hasCelebratedMilestoneToday(currentActive.id, m.id)) {
					celebratingBond = currentActive;
					celebratingMilestone = m;
					isCelebrationModalOpen = true;
					markCelebratedMilestoneToday(currentActive.id, m.id);
				}
			}
		}
	});

	async function handleCelebrateToast(bond: Bond, milestone: MilestoneItem) {
		isCelebrationToastOpen = false;
		await profileStore.setActiveBond(bond.id);
		celebratingBond = bond;
		celebratingMilestone = milestone;
		isCelebrationModalOpen = true;
		markCelebratedMilestoneToday(bond.id, milestone.id);
	}

	async function handleDisableAutoCelebrate() {
		if (!celebratingBond) return;
		const id = celebratingBond.id;
		undoBondId = id;
		await profileStore.setAutoCelebrateMilestones(false, id);
		if (undoTimer) clearTimeout(undoTimer);
		undoToastOpen = true;
		undoTimer = setTimeout(() => {
			undoToastOpen = false;
		}, 6000);
	}

	async function handleUndoDisable() {
		if (undoTimer) clearTimeout(undoTimer);
		undoToastOpen = false;
		if (undoBondId) {
			await profileStore.setAutoCelebrateMilestones(true, undoBondId);
			undoBondId = null;
		}
	}

	function handleDevTriggerModal(bond: Bond, milestone: MilestoneItem) {
		celebratingBond = bond;
		celebratingMilestone = milestone;
		isCelebrationModalOpen = true;
	}

	function handleDevTriggerToast(bond: Bond, milestone: MilestoneItem) {
		toastBond = bond;
		toastMilestone = milestone;
		isCelebrationToastOpen = true;
	}
</script>

{#if celebratingMilestone}
	<MilestoneCelebrationModal
		bind:open={isCelebrationModalOpen}
		bond={celebratingBond}
		milestone={celebratingMilestone}
		onShare={() => onShare('progress')}
		onDisableAutoCelebrate={handleDisableAutoCelebrate}
		onclose={() => (isCelebrationModalOpen = false)}
	/>
{/if}

<MilestoneCelebrationToast
	bind:open={isCelebrationToastOpen}
	bond={toastBond}
	milestone={toastMilestone}
	onCelebrate={handleCelebrateToast}
	onclose={() => (isCelebrationToastOpen = false)}
/>

{#if undoToastOpen}
	<div
		class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none pb-[max(0.5rem,env(safe-area-inset-bottom))]"
	>
		<div class="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md max-w-sm w-full">
			<div class="flex-1 text-xs text-foreground">
				Celebrations turned off for this bond.
			</div>
			<Button size="sm" variant="outline" class="h-7 text-xs px-2 cursor-pointer" onclick={handleUndoDisable}>
				Undo
			</Button>
		</div>
	</div>
{/if}

<DevToolsHub
	onTriggerModal={handleDevTriggerModal}
	onTriggerToast={handleDevTriggerToast}
/>

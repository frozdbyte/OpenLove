<script lang="ts">
	import {
		isDevMode,
		getQueuedDevMilestone,
		setQueuedDevMilestone,
		clearQueuedDevMilestone,
		SIMULATED_BOND,
		type QueuedDevMilestone
	} from '$lib/utils/dev';
	import { clearCelebrationHistory } from '$lib/utils/celebration';
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import { sendTestPush } from '$lib/push/client';
	import type { Bond } from '$lib/types/bonds';
	import type { MilestoneItem } from '$lib/types/time';
	import Button from '$lib/components/ui/button';
	import {
		Wrench,
		Sparkles,
		RefreshCw,
		X,
		Play,
		PartyPopper,
		Database,
		Clock,
		Copy,
		Check,
		Users,
		Send,
		Bell
	} from '@lucide/svelte';
	import { Portal } from 'bits-ui';

	interface Props {
		onTriggerModal: (bond: Bond, milestone: MilestoneItem) => void;
		onTriggerToast: (bond: Bond, milestone: MilestoneItem) => void;
	}

	let { onTriggerModal, onTriggerToast }: Props = $props();

	let isOpen = $state(false);
	let activeTab = $state<'milestones' | 'state'>('milestones');
	let copiedState = $state(false);

	// Target bond ID for dev triggers: 'active' | 'simulated' | specific bond ID
	let targetBondOption = $state<string>('active');
	let queuedStatus = $state<QueuedDevMilestone | null>(null);

	const devEnabled = $derived(isDevMode());

	// Check queued status on open
	$effect(() => {
		if (isOpen) {
			queuedStatus = getQueuedDevMilestone();
		}
	});

	const SAMPLE_MILESTONES: MilestoneItem[] = [
		{
			id: 'days_100',
			title: '100 Days',
			daysRequired: 100,
			targetDate: new Date(),
			isAchieved: true,
			daysRemaining: 0,
			type: 'days',
			iconName: 'Trophy'
		},
		{
			id: 'years_1',
			title: '1 Year Anniversary',
			daysRequired: 365,
			targetDate: new Date(),
			isAchieved: true,
			daysRemaining: 0,
			type: 'years',
			iconName: 'PartyPopper'
		},
		{
			id: 'days_1000',
			title: '1,000 Days',
			daysRequired: 1000,
			targetDate: new Date(),
			isAchieved: true,
			daysRemaining: 0,
			type: 'days',
			iconName: 'Trophy'
		},
		{
			id: 'years_5',
			title: '5 Years Anniversary',
			daysRequired: 1826,
			targetDate: new Date(),
			isAchieved: true,
			daysRemaining: 0,
			type: 'years',
			iconName: 'PartyPopper'
		},
		{
			id: 'custom_vacay',
			title: 'Paris Getaway ❤️',
			daysRequired: 200,
			targetDate: new Date(),
			isAchieved: true,
			daysRemaining: 0,
			type: 'custom',
			iconName: 'HeartHandshake'
		}
	];

	function resolveTargetBond(): Bond {
		if (targetBondOption === 'simulated') {
			return SIMULATED_BOND;
		}
		if (targetBondOption !== 'active') {
			const found = profileStore.state.bonds.find((b) => b.id === targetBondOption);
			if (found) return found;
		}
		return profileStore.activeBond;
	}

	function testModal(milestone: MilestoneItem) {
		const bond = resolveTargetBond();
		onTriggerModal(bond, milestone);
		isOpen = false;
	}

	function testToast(milestone: MilestoneItem) {
		const bond = resolveTargetBond();
		onTriggerToast(bond, milestone);
		isOpen = false;
	}

	function queueForLaunch(milestone: MilestoneItem, mode: 'modal' | 'toast') {
		const bond = resolveTargetBond();
		setQueuedDevMilestone({
			bondId: bond.id,
			milestone,
			mode,
			timestamp: Date.now()
		});
		queuedStatus = getQueuedDevMilestone();
	}

	function handleCancelQueue() {
		clearQueuedDevMilestone();
		queuedStatus = null;
	}

	let statusMessage = $state<string | null>(null);
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	function setFeedback(msg: string) {
		statusMessage = msg;
		if (statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => {
			statusMessage = null;
		}, 4000);
	}

	function handleResetHistory() {
		clearCelebrationHistory();
		setFeedback('✔ Celebration history cleared! Next app launch will trigger automatically.');
	}

	let isPushSending = $state(false);

	async function handleDispatchPush() {
		isPushSending = true;
		const bond = resolveTargetBond();
		try {
			const res = await sendTestPush({
				bondId: bond.id,
				milestoneTitle: '1 Year Anniversary',
				milestoneType: 'years'
			});
			if (res.success) {
				setFeedback(`✔ Real milestone WebPush dispatched for "${bond.names}"! Check your OS notifications.`);
			} else {
				setFeedback(`✖ Failed to send WebPush: ${res.error || 'Device may not have notifications enabled'}`);
			}
		} catch (e: any) {
			setFeedback(`✖ Error sending WebPush: ${e.message}`);
		} finally {
			isPushSending = false;
		}
	}

	async function copyCurrentState() {
		try {
			await navigator.clipboard.writeText(JSON.stringify(profileStore.state, null, 2));
			copiedState = true;
			setTimeout(() => (copiedState = false), 2000);
		} catch (e) {
			console.error('Failed to copy state:', e);
		}
	}
</script>

{#if devEnabled}
<Portal>
	<!-- Floating Dev Toolbar Trigger Button -->
	<div class="fixed bottom-3 left-3 z-40">
		<button
			type="button"
			class="h-9 px-3 rounded-full bg-amber-500 text-black font-mono text-xs font-bold shadow-xl flex items-center gap-1.5 hover:bg-amber-400 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-amber-600 ring-2 ring-amber-500/20"
			onclick={() => (isOpen = !isOpen)}
			title="Open Developer Tools"
		>
			<Wrench class="h-4 w-4" />
			<span>Dev Tools</span>
		</button>
	</div>

	<!-- Dev Modal Panel -->
	{#if isOpen}
		<!-- Backdrop -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs cursor-pointer"
			onclick={() => (isOpen = false)}
		></div>

		<div
			class="fixed inset-x-4 bottom-14 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:max-w-lg sm:mx-auto z-50 rounded-2xl border border-amber-500/50 bg-card p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-label="Developer Tools"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border pb-3">
				<div class="flex items-center gap-2 text-amber-500">
					<Wrench class="h-5 w-5" />
					<h3 class="font-mono text-sm font-bold text-foreground">OpenLove Dev Tools</h3>
					<span class="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
						DEV MODE
					</span>
				</div>
				<button
					type="button"
					class="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
					onclick={() => (isOpen = false)}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Active Queue Banner -->
			{#if queuedStatus}
				<div class="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
					<div class="flex items-center gap-2 min-w-0">
						<Clock class="h-4 w-4 shrink-0 text-amber-500 animate-spin" />
						<div class="truncate">
							<span class="font-bold">Queued for next app launch:</span>
							<span class="truncate block">{queuedStatus.milestone.title} ({queuedStatus.mode === 'toast' ? 'Toast' : 'Modal'})</span>
						</div>
					</div>
					<button
						type="button"
						class="text-xs font-bold underline hover:no-underline shrink-0 cursor-pointer"
						onclick={handleCancelQueue}
					>
						Cancel
					</button>
				</div>
			{/if}

			<!-- Live Status Feedback Banner -->
			{#if statusMessage}
				<div class="p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-mono text-xs">
					{statusMessage}
				</div>
			{/if}

			<!-- Tab Navigation -->
			<div class="flex items-center gap-1 p-1 bg-muted/70 rounded-xl border border-border">
				<button
					type="button"
					class="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'milestones'
						? 'bg-card text-foreground shadow-xs'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (activeTab = 'milestones')}
				>
					<PartyPopper class="h-3.5 w-3.5" />
					<span>Milestones</span>
				</button>
				<button
					type="button"
					class="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 {activeTab === 'state'
						? 'bg-card text-foreground shadow-xs'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (activeTab = 'state')}
				>
					<Database class="h-3.5 w-3.5" />
					<span>State Info</span>
				</button>
			</div>

			<!-- Tab 1: Milestones -->
			{#if activeTab === 'milestones'}
				<div class="space-y-4 text-left">
					<!-- Target Bond Selector -->
					<div class="space-y-1.5">
						<label for="dev-target-bond" class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
							<Users class="h-3.5 w-3.5 text-primary" />
							<span>Target Bond:</span>
						</label>
						<select
							id="dev-target-bond"
							bind:value={targetBondOption}
							class="w-full text-xs font-medium rounded-xl border border-border bg-muted/50 p-2 text-foreground cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary"
						>
							<option value="active">Active: {profileStore.activeBond.names}</option>
							{#each profileStore.state.bonds as bond}
								{#if bond.id !== profileStore.state.activeBondId}
									<option value={bond.id}>Secondary: {bond.names} ({bond.type})</option>
								{/if}
							{/each}
							<option value="simulated">Simulated Secondary Friendship Bond</option>
						</select>
					</div>

					<!-- Direct Triggers -->
					<div class="space-y-2">
						<p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							1. Trigger Instant Full-Screen Celebration Modal:
						</p>
						<div class="grid grid-cols-2 gap-2">
							{#each SAMPLE_MILESTONES as sample}
								<button
									type="button"
									class="text-left px-3 py-2 rounded-xl border border-border bg-muted/50 hover:bg-accent text-xs font-medium transition-colors flex items-center justify-between cursor-pointer"
									onclick={() => testModal(sample)}
								>
									<span class="truncate">{sample.title}</span>
									<Play class="h-3 w-3 shrink-0 ml-1 text-primary" />
								</button>
							{/each}
						</div>
					</div>

					<!-- Instant Toast Trigger -->
					<div class="space-y-2">
						<p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
							2. Trigger Instant Non-Active Bond Launch Toast:
						</p>
						<button
							type="button"
							class="w-full text-left px-3 py-2.5 rounded-xl border border-border bg-muted/50 hover:bg-accent text-xs font-medium transition-colors flex items-center justify-between cursor-pointer"
							onclick={() => testToast(SAMPLE_MILESTONES[1])}
						>
							<span>Trigger Launch Toast for Selected Bond</span>
							<Sparkles class="h-3.5 w-3.5 text-primary" />
						</button>
					</div>

					<!-- Queue for Next App Launch -->
					<div class="space-y-2 pt-1 border-t border-border">
						<p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
							<Send class="h-3.5 w-3.5 text-amber-500" />
							<span>3. Queue for Next App Launch / Reload:</span>
						</p>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								class="text-left px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer"
								onclick={() => queueForLaunch(SAMPLE_MILESTONES[1], 'modal')}
							>
								<span>Queue Modal (1 Yr)</span>
								<Clock class="h-3.5 w-3.5 text-amber-500 shrink-0 ml-1" />
							</button>
							<button
								type="button"
								class="text-left px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer"
								onclick={() => queueForLaunch(SAMPLE_MILESTONES[1], 'toast')}
							>
								<span>Queue Toast (1 Yr)</span>
								<Clock class="h-3.5 w-3.5 text-amber-500 shrink-0 ml-1" />
							</button>
						</div>
					</div>

					<!-- Dispatch Real WebPush -->
					<div class="space-y-2 pt-1 border-t border-border">
						<p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
							<Bell class="h-3.5 w-3.5 text-primary" />
							<span>4. Dispatch Real Milestone WebPush:</span>
						</p>
						<button
							type="button"
							class="w-full text-left px-3 py-2.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-xs font-medium transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
							onclick={handleDispatchPush}
							disabled={isPushSending}
						>
							<span>{isPushSending ? 'Sending WebPush...' : 'Send "1 Year Anniversary" WebPush to Device'}</span>
							<Bell class="h-3.5 w-3.5 text-primary" />
						</button>
					</div>

					<!-- Reset Celebration History -->
					<div class="pt-2 border-t border-border flex items-center justify-between">
						<button
							type="button"
							class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer underline underline-offset-2"
							onclick={handleResetHistory}
						>
							<RefreshCw class="h-3 w-3" />
							<span>Clear Today's Celebration History</span>
						</button>
					</div>
				</div>
			{/if}

			<!-- Tab 2: State Info -->
			{#if activeTab === 'state'}
				<div class="space-y-3 text-left">
					<div class="bg-muted/40 rounded-xl p-3 border border-border space-y-1.5 font-mono text-xs text-muted-foreground">
						<div class="flex justify-between">
							<span>Active Bond:</span>
							<span class="text-foreground font-semibold">{profileStore.activeBond.names} ({profileStore.activeBond.id})</span>
						</div>
						<div class="flex justify-between">
							<span>UI Theme:</span>
							<span class="text-foreground">{profileStore.profile.uiTheme}</span>
						</div>
						<div class="flex justify-between">
							<span>Color Palette:</span>
							<span class="text-foreground">{profileStore.profile.colorPalette}</span>
						</div>
						<div class="flex justify-between">
							<span>Push Subscribed:</span>
							<span class="text-foreground">{profileStore.state.pushSubscribed ? 'Yes' : 'No'}</span>
						</div>
						<div class="flex justify-between">
							<span>Storage Persisted:</span>
							<span class="text-foreground">{pwaStore.isStoragePersisted ? 'Yes' : 'No'}</span>
						</div>
					</div>

					<Button
						variant="outline"
						size="sm"
						class="w-full text-xs flex items-center justify-center gap-1.5 cursor-pointer"
						onclick={copyCurrentState}
					>
						{#if copiedState}
							<Check class="h-3.5 w-3.5 text-emerald-500" />
							<span>Copied to Clipboard!</span>
						{:else}
							<Copy class="h-3.5 w-3.5" />
							<span>Copy Full AppState JSON</span>
						{/if}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</Portal>
{/if}

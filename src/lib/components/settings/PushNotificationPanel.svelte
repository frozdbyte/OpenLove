<script lang="ts">
	/**
	 * Device-wide push subscription card (toggle, test alert, test milestone
	 * alert, manual scheduler trigger). Extracted from `SettingsSheet.svelte` —
	 * see REFACTOR_PLAN.md, High H1. Only ever mounted when
	 * `showAppWideSettings && !isNewBond`, so it owns its `isPushLoading`/
	 * `pushStatusMessage` state outright rather than sharing it with anything else.
	 *
	 * The test/debug buttons (and their `/api/push/test`,
	 * `/api/push/trigger-scheduler` endpoints) are gated behind `dev` from
	 * `$app/environment` — `trigger-scheduler` dispatches to every subscriber in
	 * the DB with no auth, and `test` relays a push to any endpoint/keys the
	 * caller supplies, so both must stay unreachable in a live deployment.
	 */
	import type { Bond } from '$lib/types/bonds';
	import { profileStore } from '$lib/stores/profile.svelte';
	import { subscribeToPush, unsubscribeFromPush, sendTestPush, triggerSchedulerNow } from '$lib/push/client';
	import { networkStore } from '$lib/stores/network.svelte';
	import Button from '$lib/components/ui/button';
	import Switch from '$lib/components/ui/switch';
	import { BellRing, CloudOff } from '@lucide/svelte';
	import { dev } from '$app/environment';

	interface Props {
		currentBond: Bond;
	}

	let { currentBond }: Props = $props();

	let isPushLoading = $state(false);
	let pushStatusMessage = $state('');

	async function handlePushToggle(enable: boolean) {
		isPushLoading = true;
		pushStatusMessage = '';
		try {
			if (enable) {
				const res = await subscribeToPush();
				if (!res.success) {
					pushStatusMessage = res.error || 'Failed to enable notifications';
				} else if (res.pending) {
					pushStatusMessage =
						res.error || "Saved — notifications will activate when you're back online.";
				} else {
					pushStatusMessage = 'Push notifications enabled!';
				}
			} else {
				await unsubscribeFromPush();
				pushStatusMessage = 'Push notifications disabled';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error updating push notifications';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTestPush() {
		isPushLoading = true;
		pushStatusMessage = 'Sending test notification...';
		try {
			const res = await sendTestPush();
			if (res.success) {
				pushStatusMessage = 'Test notification sent!';
			} else {
				pushStatusMessage = res.error || 'Failed to send test push';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error sending test push';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTestMilestonePush() {
		isPushLoading = true;
		pushStatusMessage = 'Sending test milestone notification...';
		try {
			const res = await sendTestPush({
				bondId: currentBond.id,
				milestoneTitle: currentBond.type === 'friendship' ? '1st Year' : '1st Anniversary',
				milestoneType: 'years'
			});
			if (res.success) {
				pushStatusMessage = `Milestone alert sent for ${currentBond.names}!`;
			} else {
				pushStatusMessage = res.error || 'Failed to send test milestone push';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error sending test push';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTriggerScheduler() {
		isPushLoading = true;
		pushStatusMessage = 'Checking milestones on server...';
		try {
			const res = await triggerSchedulerNow();
			if (res.success) {
				pushStatusMessage = `Scheduler ran! Sent ${res.sent ?? 0} notification(s).`;
			} else {
				pushStatusMessage = res.error || 'Failed to run scheduler';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error running scheduler';
		} finally {
			isPushLoading = false;
		}
	}
</script>

<!-- Push Notifications Master Connection -->
<section class="p-3.5 rounded-2xl bg-card border border-border space-y-3">
	<div class="flex items-center justify-between">
		<div class="space-y-0.5">
			<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
				<BellRing class="h-4 w-4 text-primary" />
				<span>Device Notifications</span>
			</div>
			<div class="text-xs text-muted-foreground">Receive background WebPush alerts on this device</div>
		</div>
		<Switch
			checked={profileStore.state.pushSubscribed}
			disabled={isPushLoading}
			onchange={handlePushToggle}
		/>
	</div>

	{#if profileStore.state.pushSubscribed}
		<div class="pt-2 border-t border-border/50 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Device Connected</span>
				{#if dev}
					<Button
						size="sm"
						variant="outline"
						class="h-7 text-xs px-2.5"
						onclick={handleTestPush}
						disabled={isPushLoading || !networkStore.isOnline}
					>
						<span>{networkStore.isOnline ? 'Test Alert' : 'Offline'}</span>
					</Button>
				{/if}
			</div>

			{#if dev}
				<div class="flex items-center gap-1.5 pt-1">
					<Button
						size="sm"
						variant="outline"
						class="flex-1 h-7 text-[11px] px-2"
						onclick={handleTestMilestonePush}
						disabled={isPushLoading || !networkStore.isOnline}
						title="Sends a test milestone alert formatted specifically for your active relationship/friendship"
					>
						<span>Test Milestone Alert</span>
					</Button>
					<Button
						size="sm"
						variant="outline"
						class="flex-1 h-7 text-[11px] px-2"
						onclick={handleTriggerScheduler}
						disabled={isPushLoading || !networkStore.isOnline}
						title="Triggers the server's milestone evaluation logic on all registered bonds right now"
					>
						<span>Run Cron Check</span>
					</Button>
				</div>
			{/if}
		</div>
	{:else if profileStore.state.pushIntent}
		<div class="pt-2 border-t border-border/50 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
			<CloudOff class="h-3.5 w-3.5 shrink-0" />
			<span>Waiting for a connection to activate on this device</span>
		</div>
	{/if}

	{#if pushStatusMessage}
		<p class="text-xs text-muted-foreground italic">{pushStatusMessage}</p>
	{/if}
</section>

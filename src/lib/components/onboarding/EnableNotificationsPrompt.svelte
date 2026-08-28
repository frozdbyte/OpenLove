<script lang="ts">
	/**
	 * One-time prompt shown after onboarding completes, offering to enable push
	 * notifications — see `+page.svelte`'s trigger `$effect` for the exact
	 * conditions (not already subscribed/intending, not shown before, and the
	 * environment actually supports push). `onclose` is the single place that
	 * marks the prompt as shown, regardless of *how* it closed (Enable, "Not
	 * Now", the header X, swipe-to-dismiss, or Escape) — callers just set
	 * `open = false` and let `Modal`'s own close flow call `onclose`.
	 */
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import { profileStore } from '$lib/stores/profile.svelte';
	import { subscribeToPush } from '$lib/push/client';
	import { BellRing } from '@lucide/svelte';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let isLoading = $state(false);
	let statusMessage = $state('');

	function handleClose() {
		void profileStore.markNotificationsPromptShown();
	}

	async function handleEnable() {
		isLoading = true;
		statusMessage = '';
		try {
			const res = await subscribeToPush();
			if (!res.success) {
				statusMessage = res.error || 'Failed to enable notifications.';
				return;
			}
		} catch (err: any) {
			statusMessage = err?.message || 'Failed to enable notifications.';
			return;
		} finally {
			isLoading = false;
		}
		open = false;
	}
</script>

<Modal
	bind:open
	title="Enable Notifications?"
	description="Get a gentle nudge before anniversaries and milestones"
	onclose={handleClose}
>
	<div class="space-y-4">
		<div class="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-start gap-3">
			<div class="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
				<BellRing class="h-5 w-5" />
			</div>
			<p class="text-xs text-muted-foreground leading-relaxed">
				Turn on notifications so Open Love can remind you before anniversaries and milestones —
				no more forgetting a special day.
			</p>
		</div>

		{#if statusMessage}
			<p class="text-xs text-center text-muted-foreground italic">{statusMessage}</p>
		{/if}

		<div class="space-y-2">
			<Button class="w-full h-11" onclick={handleEnable} disabled={isLoading}>
				<BellRing class="h-4 w-4 mr-1.5" />
				<span>{isLoading ? 'Enabling…' : 'Enable Notifications'}</span>
			</Button>
			<Button
				variant="ghost"
				class="w-full text-muted-foreground"
				onclick={() => (open = false)}
				disabled={isLoading}
			>
				<span>Not Now</span>
			</Button>
		</div>

		<p class="text-[11px] text-center text-muted-foreground/70">
			You can change this anytime in Settings → Notifications.
		</p>
	</div>
</Modal>

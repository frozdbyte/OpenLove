<script lang="ts">
	import { networkStore } from '$lib/stores/network.svelte';
	import { profileStore } from '$lib/stores/profile.svelte';
	import { flush } from '$lib/sync';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import { WifiOff, ServerCrash, CloudCheck, RefreshCw, Info } from '@lucide/svelte';
	import type { SyncOp } from '$lib/types/sync';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let retrying = $state(false);

	async function retryNow() {
		if (retrying) return;
		retrying = true;
		try {
			await flush({ force: true });
		} finally {
			retrying = false;
		}
	}

	/** Ops only ever carry a `bondId`, not a display name — cross-reference the
	 *  bond locally so the list reads as "Emma & Paul" rather than a raw UUID. */
	function opLabel(op: SyncOp): string {
		if (op.kind === 'delete') return 'Turning off notifications for this device';

		const names = op.bonds
			.map((b) => profileStore.state.bonds.find((bond) => bond.id === b.bondId)?.names)
			.filter((n): n is string => !!n);

		return names.length > 0
			? `Notification settings for ${names.join(', ')}`
			: 'Notification settings for this device';
	}

	function timeAgo(iso: string): string {
		const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `${hours} hr ago`;
		const days = Math.round(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	}

	let statusTitle = $derived.by(() => {
		if (!networkStore.isOnline) return "You're offline";
		if (networkStore.reachability === 'server-unreachable') return 'The server is not reachable';
		if (networkStore.pendingCount > 0) return 'Waiting to sync';
		return 'All changes synced';
	});

	let statusDetail = $derived.by(() => {
		if (!networkStore.isOnline) {
			return "Changes are saved on this device and will sync once you're back online.";
		}
		if (networkStore.reachability === 'server-unreachable') {
			return "Your device is connected, but Open Love's server didn't respond. This can happen if it's restarting or your connection to it is blocked.";
		}
		if (networkStore.pendingCount > 0) {
			return 'This will sync automatically in the background.';
		}
		return 'Everything on this device matches the server.';
	});
</script>

<Modal bind:open title="Sync Status" description={statusTitle}>
	<div class="space-y-4 pb-2">
		<div
			class="flex items-start gap-3 p-3.5 rounded-2xl border {networkStore.isOnline &&
			networkStore.reachability !== 'server-unreachable'
				? 'bg-card border-border'
				: 'bg-amber-500/10 border-amber-500/25'}"
		>
			{#if !networkStore.isOnline}
				<WifiOff class="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
			{:else if networkStore.reachability === 'server-unreachable'}
				<ServerCrash class="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
			{:else}
				<CloudCheck class="h-4 w-4 shrink-0 mt-0.5 text-primary" />
			{/if}
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">{statusTitle}</p>
				<p class="text-xs text-muted-foreground mt-0.5">{statusDetail}</p>
			</div>
		</div>

		<div class="flex items-start gap-2.5 text-xs text-muted-foreground">
			<Info class="h-3.5 w-3.5 shrink-0 mt-0.5" />
			<p>
				Open Love only sends your push-notification settings to the server, so it knows when to
				alert you about milestones. Your names, dates and photos stay on this device.
			</p>
		</div>

		{#if networkStore.pendingOps.length > 0}
			<div class="space-y-2">
				<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
					Pending ({networkStore.pendingOps.length})
				</h3>
				<ul class="space-y-1.5">
					{#each networkStore.pendingOps as op (op.opId)}
						<li
							class="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-muted/50 border border-border/50"
						>
							<span class="min-w-0 truncate text-sm text-foreground">{opLabel(op)}</span>
							<span class="shrink-0 text-[11px] text-muted-foreground"
								>{timeAgo(op.clientUpdatedAt)}</span
							>
						</li>
					{/each}
				</ul>
			</div>

			<Button variant="outline" class="w-full" onclick={retryNow} disabled={retrying}>
				<RefreshCw class="h-4 w-4 mr-1.5 {retrying ? 'animate-spin' : ''}" />
				<span>{retrying ? 'Retrying…' : 'Retry Now'}</span>
			</Button>
		{/if}
	</div>
</Modal>

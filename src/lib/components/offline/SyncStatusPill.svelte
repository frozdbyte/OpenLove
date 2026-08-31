<script lang="ts">
	import { networkStore } from '$lib/stores/network.svelte';
	import { CloudOff, RefreshCw, CloudUpload } from '@lucide/svelte';
	import SyncDetailsDrawer from './SyncDetailsDrawer.svelte';

	interface Props {
		/** Each UI theme styles the pill to its own idiom. */
		variant?: 'modern' | 'traditional';
		class?: string;
	}

	let { variant = 'modern', class: className = '' }: Props = $props();

	// Self-contained rather than lifted to a shared store: the pill is already
	// mounted independently in all 7 theme components, so giving it its own
	// drawer state here means none of those call sites need to change.
	let drawerOpen = $state(false);

	let pillState = $derived.by(() => {
		if (!networkStore.isOnline) return 'offline' as const;
		if (networkStore.isSyncing && networkStore.pendingCount > 0) return 'syncing' as const;
		if (networkStore.pendingCount > 0) return 'pending' as const;
		return 'idle' as const;
	});

	let label = $derived.by(() => {
		switch (pillState) {
			case 'offline':
				return 'Offline — changes saved on this device';
			case 'syncing':
				return 'Syncing…';
			case 'pending':
				return networkStore.pendingCount === 1
					? '1 change pending'
					: `${networkStore.pendingCount} changes pending`;
			default:
				return '';
		}
	});
</script>

{#if pillState !== 'idle'}
	{#if variant === 'traditional'}
		<button
			type="button"
			class="w-full bg-primary/90 text-primary-foreground px-4 py-1.5 flex items-center justify-center gap-2 font-serif text-xs sm:text-sm tracking-wide cursor-pointer {className}"
			onclick={() => (drawerOpen = true)}
			aria-haspopup="dialog"
		>
			{#if pillState === 'offline'}
				<CloudOff class="h-3.5 w-3.5 shrink-0" />
			{:else if pillState === 'syncing'}
				<RefreshCw class="h-3.5 w-3.5 shrink-0 animate-spin" />
			{:else}
				<CloudUpload class="h-3.5 w-3.5 shrink-0" />
			{/if}
			<span class="italic">{label}</span>
		</button>
	{:else}
		<button
			type="button"
			class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold backdrop-blur-md cursor-pointer
				{pillState === 'offline'
				? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
				: 'bg-primary/10 border-primary/20 text-primary'} {className}"
			onclick={() => (drawerOpen = true)}
			aria-haspopup="dialog"
		>
			{#if pillState === 'offline'}
				<CloudOff class="h-3 w-3 shrink-0" />
			{:else if pillState === 'syncing'}
				<RefreshCw class="h-3 w-3 shrink-0 animate-spin" />
			{:else}
				<CloudUpload class="h-3 w-3 shrink-0" />
			{/if}
			<span class="truncate max-w-[16rem]">{label}</span>
		</button>
	{/if}
{/if}

<SyncDetailsDrawer bind:open={drawerOpen} />

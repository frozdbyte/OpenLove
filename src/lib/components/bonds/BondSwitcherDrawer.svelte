<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { createKeyedPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';
	import type { Bond } from '$lib/types/bonds';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge';
	import { Heart, Sparkles, Plus, Check, Edit3, Calendar } from '@lucide/svelte';
	import { calculateTimeBreakdown } from '$lib/utils/time';
	import SettingsSheet from '$lib/components/settings/SettingsSheet.svelte';

	interface Props {
		open?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

	let isSettingsOpen = $state(false);
	let selectedBondIdToEdit = $state<string | null>(null);
	let isNewBond = $state(false);

	function openAddModal() {
		selectedBondIdToEdit = null;
		isNewBond = true;
		isSettingsOpen = true;
	}

	function openEditModal(bond: Bond, e: MouseEvent) {
		e.stopPropagation();
		selectedBondIdToEdit = bond.id;
		isNewBond = false;
		isSettingsOpen = true;
	}

	async function handleSelectBond(id: string) {
		await profileStore.setActiveBond(id);
		open = false;
		onclose?.();
	}

	// Keyed since this list renders every bond's photo in one component
	// instance (not one per row) — see `createKeyedPhotoRetryGuard`'s doc
	// comment.
	const photoGuard = createKeyedPhotoRetryGuard();
</script>

<Modal
	bind:open
	title="Relationships & Bonds"
	description="Switch active relationship or add another partner or friendship"
	{onclose}
>
	<div class="space-y-4 pb-2">
		<!-- Bond List -->
		<div class="space-y-2.5 max-h-72 overflow-y-auto pr-1">
			{#each profileStore.state.bonds as bond (bond.id)}
				{@const isActive = bond.id === profileStore.state.activeBondId}
				{@const breakdown = calculateTimeBreakdown(bond.togetherSince)}

				<div
					class="w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left cursor-pointer {isActive
						? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs'
						: 'border-border bg-card/70 hover:bg-accent/60'}"
					onclick={() => handleSelectBond(bond.id)}
					role="button"
					tabindex="0"
					onkeydown={(e) => e.key === 'Enter' && handleSelectBond(bond.id)}
				>
					<div class="flex items-center gap-3 min-w-0">
						<!-- Avatar / Icon. The "selected" badge is a sibling of the
						     clipped image wrapper, not a child of it — a child would
						     get its negative-offset corner clipped by the wrapper's
						     own `overflow-hidden` rounding, same as ModernTheme's
						     avatar badge is structured. -->
						<div class="relative h-12 w-12 shrink-0">
							<div class="h-12 w-12 rounded-full overflow-hidden bg-muted border border-border/80 flex items-center justify-center">
								{#if bond.photoUrl}
									<img
										src={bond.photoUrl}
										alt={bond.names}
										class="h-full w-full object-cover"
										onerror={() => photoGuard.handleError(bond)}
										onload={() => photoGuard.handleLoad(bond)}
									/>
								{:else if bond.type === 'friendship'}
									<div class="h-full w-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
										<Sparkles class="h-6 w-6" />
									</div>
								{:else}
									<div class="h-full w-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-500">
										<Heart class="h-6 w-6 fill-rose-500/20" />
									</div>
								{/if}
							</div>

							{#if isActive}
								<div class="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-white flex items-center justify-center shadow-xs">
									<Check class="h-2.5 w-2.5 stroke-3" />
								</div>
							{/if}
						</div>

						<!-- Details -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h3 class="font-bold text-sm text-foreground truncate">{bond.names}</h3>
								<Badge
									variant={bond.type === 'friendship' ? 'outline' : 'romantic'}
									class="text-[10px] py-0 px-1.5 shrink-0"
								>
									{#if bond.type === 'friendship'}
										🌿 Friend
									{:else}
										💖 Couple
									{/if}
								</Badge>
							</div>

							<div class="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
								<Calendar class="h-3 w-3 shrink-0" />
								<span class="truncate">
									{bond.type === 'friendship' ? 'Friends for' : 'Together for'} {breakdown.totalDays.toLocaleString()} days
								</span>
							</div>
						</div>
					</div>

					<!-- Edit Button -->
					<button
						type="button"
						class="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer shrink-0 ml-2"
						onclick={(e) => openEditModal(bond, e)}
						aria-label="Edit bond"
						title="Edit bond"
					>
						<Edit3 class="h-4 w-4" />
					</button>
				</div>
			{/each}
		</div>

		<!-- Add Bond Button -->
		<Button variant="outline" class="w-full h-11 rounded-2xl" onclick={openAddModal}>
			<Plus class="h-4 w-4 mr-2" />
			<span>Add Relationship or Friendship</span>
		</Button>
	</div>
</Modal>

<SettingsSheet
	bind:open={isSettingsOpen}
	targetBondId={selectedBondIdToEdit}
	{isNewBond}
	showAppWideSettings={false}
	onclose={() => {
		isSettingsOpen = false;
		selectedBondIdToEdit = null;
		isNewBond = false;
	}}
/>

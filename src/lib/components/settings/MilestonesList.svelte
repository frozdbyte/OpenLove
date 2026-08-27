<script lang="ts">
	/**
	 * Milestone list + custom-milestone add/delete for an existing bond. Extracted
	 * from `SettingsSheet.svelte` — see REFACTOR_PLAN.md, High H1.
	 *
	 * Only ever mounted for an existing bond (the parent gates it behind
	 * `{#if !isNewBond}`), so — unlike the original inline markup, which carried an
	 * `isNewBond` ternary into `calculateMilestones`'s inputs purely for a branch
	 * that was already unreachable wherever this list actually rendered — this
	 * reads `currentBond`'s data directly, and `addCustomMilestone`/
	 * `deleteCustomMilestone` no longer need their prior `if (isNewBond) return;`
	 * guards for the same reason.
	 */
	import type { Bond } from '$lib/types/bonds';
	import { profileStore } from '$lib/stores/profile.svelte';
	import { calculateMilestones } from '$lib/utils/time';
	import Input from '$lib/components/ui/input';
	import Button from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge';
	import { Plus, Trash2, PartyPopper, Sparkles, HeartHandshake, Trophy } from '@lucide/svelte';

	interface Props {
		currentBond: Bond;
	}

	let { currentBond }: Props = $props();

	let bondMilestoneData = $derived(
		calculateMilestones(currentBond.togetherSince, currentBond.customMilestones, new Date(), currentBond.milestonePrefs)
	);

	let selectedMilestoneTab = $state<'all' | 'months' | 'years' | 'days' | 'custom'>('all');

	let filteredMilestones = $derived(
		bondMilestoneData.milestones.filter((m) => {
			if (selectedMilestoneTab === 'all') return true;
			return m.type === selectedMilestoneTab;
		})
	);

	let newMilestoneTitle = $state('');
	let newMilestoneDate = $state('');
	let isAddingMilestone = $state(false);

	async function addCustomMilestone() {
		if (!newMilestoneTitle.trim() || !newMilestoneDate) return;

		const current = currentBond.customMilestones;
		const updated = [
			...current,
			{
				id: `custom_${Date.now()}`,
				title: newMilestoneTitle.trim(),
				date: newMilestoneDate
			}
		];
		await profileStore.updateBond(currentBond.id, { customMilestones: updated });
		newMilestoneTitle = '';
		newMilestoneDate = '';
		isAddingMilestone = false;
	}

	async function deleteCustomMilestone(id: string) {
		const current = currentBond.customMilestones;
		const updated = current.filter((m) => m.id !== id);
		await profileStore.updateBond(currentBond.id, { customMilestones: updated });
	}
</script>

<!-- Milestones List & Custom Milestones (Per-Bond) -->
<section class="space-y-3">
	<div class="flex items-center justify-between">
		<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Milestones for {currentBond.names}</span>
		<Button size="sm" variant="ghost" onclick={() => (isAddingMilestone = !isAddingMilestone)}>
			<Plus class="h-4 w-4 mr-1" />
			<span>Add Custom</span>
		</Button>
	</div>

	{#if isAddingMilestone}
		<div class="p-3 rounded-2xl bg-card border border-border space-y-2">
			<Input placeholder="Milestone Name (e.g. First Date, Moved In)" bind:value={newMilestoneTitle} />
			<Input type="date" bind:value={newMilestoneDate} />
			<div class="flex gap-2">
				<Button size="sm" class="flex-1" onclick={addCustomMilestone}>Save</Button>
				<Button size="sm" variant="outline" onclick={() => (isAddingMilestone = false)}>Cancel</Button>
			</div>
		</div>
	{/if}

	<!-- Filter tabs -->
	<div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
		{#each [
			{ id: 'all' as const, label: 'All' },
			{ id: 'months' as const, label: 'Months' },
			{ id: 'years' as const, label: 'Years' },
			{ id: 'days' as const, label: 'Days' },
			{ id: 'custom' as const, label: 'Custom' }
		] as tab}
			<button
				type="button"
				class="px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer {selectedMilestoneTab === tab.id
					? 'bg-primary text-white shadow-sm'
					: 'bg-card text-muted-foreground hover:text-foreground border border-border'}"
				onclick={() => (selectedMilestoneTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="space-y-2 max-h-52 overflow-y-auto pr-1">
		{#each filteredMilestones as m}
			<div class="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 text-xs text-foreground">
				<div class="flex items-center gap-2">
					{#if m.type === 'years'}
						<PartyPopper class="h-4 w-4 text-amber-500 shrink-0" />
					{:else if m.type === 'months'}
						<Sparkles class="h-4 w-4 text-rose-500 shrink-0" />
					{:else if m.type === 'custom'}
						<HeartHandshake class="h-4 w-4 text-primary shrink-0" />
					{:else}
						<Trophy class="h-4 w-4 text-amber-600 shrink-0" />
					{/if}
					<span class="font-medium {m.isAchieved ? 'line-through text-muted-foreground' : 'text-foreground'}">{m.title}</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Badge variant={m.isAchieved ? 'secondary' : 'romantic'} class="text-[10px]">
						{m.isAchieved ? 'Achieved' : `in ${m.daysRemaining} days`}
					</Badge>
					{#if m.type === 'custom'}
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive p-1 rounded transition-colors cursor-pointer"
							onclick={() => deleteCustomMilestone(m.sourceId!)}
							title="Delete"
							aria-label="Delete milestone"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>

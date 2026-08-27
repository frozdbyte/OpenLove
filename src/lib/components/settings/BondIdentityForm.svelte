<script lang="ts">
	/**
	 * Bond type, names, together-since date, and photo — the "who is this bond
	 * about" fields. Extracted from `SettingsSheet.svelte`'s 1,200+ line body; see
	 * REFACTOR_PLAN.md, High H1.
	 *
	 * Draft state (`bondType`/`bondNames`/`bondTogetherSince`/`bondPhotoUrl`) stays
	 * owned by the parent — this component only reads it for display and forwards
	 * raw input values up via callbacks, matching the codebase's existing
	 * callback-prop convention (`Switch`'s `onchange`, the Phase 3 selectors) rather
	 * than introducing two-way binding for fields the parent also needs for
	 * `handleCreateNewBond`.
	 */
	import type { Bond, BondType } from '$lib/types/bonds';
	import Input from '$lib/components/ui/input';
	import Button from '$lib/components/ui/button';
	import BondTypeSelector from '$lib/components/shared/BondTypeSelector.svelte';
	import { Upload, Trash2, Sparkles } from '@lucide/svelte';

	interface Props {
		isNewBond: boolean;
		currentBond: Bond;
		bondType: BondType;
		bondNames: string;
		bondTogetherSince: string;
		bondPhotoUrl: string | undefined;
		onTypeChange: (type: BondType) => void;
		onNamesChange: (value: string) => void;
		onDateChange: (value: string) => void;
		onPhotoUpload: (e: Event) => void;
		onPhotoRemove: () => void;
	}

	let {
		isNewBond,
		currentBond,
		bondType,
		bondNames,
		bondTogetherSince,
		bondPhotoUrl,
		onTypeChange,
		onNamesChange,
		onDateChange,
		onPhotoUpload,
		onPhotoRemove
	}: Props = $props();

	let fileInputRef = $state<HTMLInputElement | null>(null);

	let displayedPhotoUrl = $derived(isNewBond ? bondPhotoUrl : currentBond.photoUrl);
</script>

<!-- Bond Type Selector -->
<section>
	<BondTypeSelector value={bondType} onchange={onTypeChange} />
</section>

<!-- Names & Start Date of this Bond -->
<section class="space-y-3">
	<div>
		<label for="settings-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
			{bondType === 'friendship' ? 'Friend Names' : 'Partner Names'}
		</label>
		<Input
			id="settings-names"
			value={isNewBond ? bondNames : currentBond.names}
			placeholder={bondType === 'friendship' ? 'e.g. Alex & Sam' : 'e.g. Emma & Paul'}
			oninput={(e) => onNamesChange((e.target as HTMLInputElement).value)}
		/>
	</div>

	<div>
		<label for="settings-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
			{bondType === 'friendship' ? 'Friends Since Date' : 'Together Since Date'}
		</label>
		<Input
			id="settings-date"
			type="date"
			value={isNewBond ? bondTogetherSince : currentBond.togetherSince}
			onchange={(e) => onDateChange((e.target as HTMLInputElement).value)}
		/>
	</div>
</section>

<!-- Photo for this Bond -->
<section class="space-y-3">
	<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
		{bondType === 'friendship' ? 'Friend Photo' : 'Couple Photo'}
	</span>
	<div class="flex items-center gap-4">
		<div class="h-16 w-16 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
			{#if displayedPhotoUrl}
				<img src={displayedPhotoUrl} alt="Bond" class="h-full w-full object-cover" />
			{:else if bondType === 'friendship'}
				<Sparkles class="h-6 w-6 text-muted-foreground" />
			{:else}
				<Upload class="h-6 w-6 text-muted-foreground" />
			{/if}
		</div>

		<div class="flex flex-col gap-2 flex-1">
			<input
				type="file"
				accept="image/*"
				class="hidden"
				bind:this={fileInputRef}
				onchange={onPhotoUpload}
			/>
			<Button size="sm" variant="outline" onclick={() => fileInputRef?.click()}>
				<Upload class="h-4 w-4 mr-1.5" />
				<span>{displayedPhotoUrl ? 'Change Photo' : 'Upload Photo'}</span>
			</Button>

			{#if displayedPhotoUrl}
				<Button size="sm" variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={onPhotoRemove}>
					<Trash2 class="h-4 w-4 mr-1.5" />
					<span>Remove Photo</span>
				</Button>
			{/if}
		</div>
	</div>
</section>

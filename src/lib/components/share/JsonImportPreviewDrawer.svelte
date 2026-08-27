<script lang="ts">
	/**
	 * Pure preview + confirm UI shown between "a JSON backup file was
	 * selected" and "it's actually imported" — used by both
	 * `OverviewStep.svelte` (onboarding's restore shortcut) and
	 * `StorageBackupPanel.svelte` (Settings' restore button). Never calls
	 * `profileStore.importJSON()`/`importJSONFromFile()` itself; the caller
	 * owns the actual mutation (via `onConfirm`) and its own post-import
	 * success/failure feedback, since the two callers want different UX
	 * there (inline text vs `alert()`).
	 */
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import { Heart, TriangleAlert, Info } from '@lucide/svelte';
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { ImportPreview } from '$lib/utils/share';

	interface Props {
		open: boolean;
		preview: ImportPreview | null;
		onConfirm: () => void;
	}

	let { open = $bindable(false), preview, onConfirm }: Props = $props();

	let bondCount = $derived(preview?.bonds.length ?? 0);
	let isOverwrite = $derived(preview?.kind === 'full-backup' && profileStore.state.isConfigured);
	let isAdditive = $derived(preview?.kind !== 'full-backup' && profileStore.state.isConfigured);
</script>

<Modal bind:open title="Restore from Backup?">
	{#if preview}
		<div class="space-y-1.5">
			<p class="text-xs font-semibold text-muted-foreground">
				{bondCount === 1 ? 'This file contains 1 relationship:' : `This file contains ${bondCount} relationships:`}
			</p>
			<ul class="space-y-1.5">
				{#each preview.bonds as bond}
					<li class="flex items-center gap-2 p-2.5 rounded-xl bg-card border border-border">
						<div class="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
							<Heart class="h-3.5 w-3.5 fill-primary" />
						</div>
						<span class="text-sm font-semibold text-foreground truncate">{bond.names}</span>
					</li>
				{/each}
			</ul>
		</div>

		{#if isOverwrite}
			<div class="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive">
				<TriangleAlert class="h-4 w-4 shrink-0 mt-0.5" />
				<p class="text-xs font-medium leading-relaxed">
					Importing will replace ALL {profileStore.state.bonds.length}
					{profileStore.state.bonds.length === 1 ? 'bond' : 'bonds'} currently on this device —
					this cannot be undone unless you have your own backup.
				</p>
			</div>
		{:else if isAdditive}
			<div class="flex items-start gap-2 p-3 rounded-xl bg-muted/60 border border-border text-muted-foreground">
				<Info class="h-4 w-4 shrink-0 mt-0.5" />
				<p class="text-xs font-medium leading-relaxed">This will be added as a new bond.</p>
			</div>
		{/if}

		<div class="flex gap-2 pt-1">
			<Button variant="outline" class="flex-1" onclick={() => (open = false)}>Cancel</Button>
			<Button variant={isOverwrite ? 'destructive' : 'default'} class="flex-1" onclick={onConfirm}>
				{isOverwrite ? 'Overwrite & Restore' : 'Restore'}
			</Button>
		</div>
	{/if}
</Modal>

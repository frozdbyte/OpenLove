<script lang="ts">
	/**
	 * Step 5 of `OnboardingFlow.svelte`'s wizard: optional couple/friend photo.
	 * Extracted per REFACTOR_PLAN.md, Medium M5. Fully self-contained — reads and
	 * writes `profileStore` directly, since nothing outside this step needs its
	 * upload state.
	 */
	import type { BondType } from '$lib/types/bonds';
	import { profileStore } from '$lib/stores/profile.svelte';
	import Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button';
	import { Upload, Trash2 } from '@lucide/svelte';

	interface Props {
		bondType: BondType;
	}

	let { bondType }: Props = $props();

	let fileInputRef = $state<HTMLInputElement | null>(null);

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			await profileStore.setPhoto(target.files[0]);
		}
	}
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
			{bondType === 'friendship' ? 'Add a Friend Picture' : 'Add a Couple Picture'}
		</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">Make your tracker uniquely yours (optional)</p>
	</div>


	<Card class="p-3.5 sm:p-5 bg-card border-border shadow-sm flex flex-col items-center space-y-3 rounded-2xl">
		<div class="relative h-24 w-24 sm:h-32 sm:w-32 rounded-2xl overflow-hidden bg-muted border-2 border-dashed border-border flex items-center justify-center shadow-inner group shrink-0">
			{#if profileStore.profile.photoUrl}
				<img src={profileStore.profile.photoUrl} alt="Preview" class="h-full w-full object-cover" />
			{:else}
				<Upload class="h-8 w-8 text-muted-foreground/60 group-hover:scale-110 transition-transform" />
			{/if}
		</div>

		<input
			type="file"
			accept="image/*"
			class="hidden"
			bind:this={fileInputRef}
			onchange={handlePhotoUpload}
		/>

		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => fileInputRef?.click()}>
				<Upload class="h-3.5 w-3.5 mr-1" />
				<span>{profileStore.profile.photoUrl ? 'Change' : 'Upload'}</span>
			</Button>

			{#if profileStore.profile.photoUrl}
				<Button variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => profileStore.setPhoto(null)}>
					<Trash2 class="h-3.5 w-3.5 mr-1" />
					<span>Remove</span>
				</Button>
			{/if}
		</div>
	</Card>
</div>

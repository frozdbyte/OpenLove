<script lang="ts">
	/**
	 * Accent color swatch picker. Already array-driven in `SettingsSheet.svelte`
	 * (its only current consumer) — moved out unchanged so `SettingsSheet`'s own
	 * decomposition (REFACTOR_PLAN.md Phase 4) can just import it. See H3.
	 */
	import type { ColorPalette } from '$lib/types/profile';
	import { Check } from '@lucide/svelte';

	interface Props {
		value: ColorPalette;
		onchange: (palette: ColorPalette) => void;
	}

	let { value, onchange }: Props = $props();

	const PALETTES: { id: ColorPalette; name: string; bg: string }[] = [
		{ id: 'rose', name: 'Rose', bg: 'bg-rose-500' },
		{ id: 'lavender', name: 'Lavender', bg: 'bg-purple-500' },
		{ id: 'terracotta', name: 'Terracotta', bg: 'bg-orange-600' },
		{ id: 'sage', name: 'Sage', bg: 'bg-emerald-600' },
		{ id: 'midnight', name: 'Midnight', bg: 'bg-blue-600' }
	];
</script>

<div class="pt-2">
	<span class="text-[11px] text-muted-foreground font-medium block mb-2">Accent Color Palette</span>
	<div class="flex items-center gap-3 px-2">
		{#each PALETTES as p}
			<button
				type="button"
				class="h-8 w-8 rounded-full {p.bg} transition-transform cursor-pointer flex items-center justify-center {value === p.id
					? 'ring-5 ring-primary/30 scale-110'
					: 'opacity-80 hover:opacity-100'}"
				onclick={() => onchange(p.id)}
				title={p.name}
				aria-label={p.name}
			>
				{#if value === p.id}
					<Check class="h-4 w-4 text-white" />
				{/if}
			</button>
		{/each}
	</div>
</div>

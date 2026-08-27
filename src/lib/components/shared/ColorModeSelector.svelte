<script lang="ts">
	/**
	 * System/Light/Dark picker. Was hand-duplicated between `SettingsSheet.svelte`
	 * (no label of its own — shared with the palette picker under one "Color
	 * Appearance" heading) and `OnboardingFlow.svelte` (its own "Color Appearance"
	 * label, larger icons on `sm+`, `font-medium` labels). See REFACTOR_PLAN.md,
	 * High H3.
	 */
	import type { ColorMode } from '$lib/types/profile';
	import { Monitor, Sun, Moon } from '@lucide/svelte';

	interface Props {
		value: ColorMode;
		onchange: (mode: ColorMode) => void;
		showLabel?: boolean;
		layout?: 'compact' | 'detailed';
	}

	let { value, onchange, showLabel = false, layout = 'compact' }: Props = $props();

	const OPTIONS = [
		{ id: 'system' as const, label: 'System', icon: Monitor },
		{ id: 'light' as const, label: 'Light', icon: Sun },
		{ id: 'dark' as const, label: 'Dark', icon: Moon }
	];

	const SELECTED_CLASS =
		'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary';

	let buttonBaseClass = $derived(
		layout === 'detailed'
			? 'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border transition-all cursor-pointer'
			: 'flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer'
	);
	let unselectedClass = $derived(
		layout === 'detailed'
			? 'border-border bg-card text-foreground hover:bg-accent'
			: 'border-border bg-card/60 text-foreground hover:bg-accent'
	);
	let iconSizeClass = $derived(layout === 'detailed' ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-4 w-4');
	let labelClass = $derived(layout === 'detailed' ? 'text-xs font-medium' : 'text-xs');
</script>

<div>
	{#if showLabel}
		<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Color Appearance</span>
	{/if}
	<div class="grid grid-cols-3 gap-2">
		{#each OPTIONS as opt}
			{@const selected = value === opt.id}
			<button
				type="button"
				class="{buttonBaseClass} {selected ? SELECTED_CLASS : unselectedClass}"
				onclick={() => onchange(opt.id)}
			>
				<opt.icon class="{iconSizeClass} {selected ? 'text-primary' : 'text-muted-foreground'}" />
				<span class={labelClass}>{opt.label}</span>
			</button>
		{/each}
	</div>
</div>

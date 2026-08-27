<script lang="ts">
	/**
	 * Romantic/Friendship picker. Was hand-duplicated between `SettingsSheet.svelte`
	 * and `OnboardingFlow.svelte` — see REFACTOR_PLAN.md, High H3.
	 *
	 * `variant="compact"` reproduces Settings' sizing (used inline with a "Bond Type"
	 * label); `variant="onboarding"` reproduces the wizard's responsive sizing and
	 * shorter description copy. Both call sites' visual output is unchanged — this
	 * only consolidates the markup, not the two contexts' existing styling.
	 */
	import type { BondType } from '$lib/types/bonds';
	import { Heart, Sparkles } from '@lucide/svelte';

	interface Props {
		value: BondType;
		onchange: (type: BondType) => void;
		variant?: 'compact' | 'onboarding';
		/** Settings renders its own "Bond Type" section label; the onboarding wizard's
		 * step heading already introduces the choice, so it omits this. */
		showLabel?: boolean;
	}

	let { value, onchange, variant = 'compact', showLabel = true }: Props = $props();

	const OPTIONS: {
		id: BondType;
		label: string;
		descriptionCompact: string;
		descriptionOnboarding: string;
	}[] = [
		{
			id: 'romantic',
			label: 'Relationship',
			descriptionCompact: 'Romantic couple & anniversaries',
			descriptionOnboarding: 'Couple & anniversaries'
		},
		{
			id: 'friendship',
			label: 'Friendship',
			descriptionCompact: 'Platonic best friends & bonds',
			descriptionOnboarding: 'Best friends & bonds'
		}
	];

	let cardPadding = $derived(variant === 'onboarding' ? 'p-2.5 sm:p-3' : 'p-3');
	let headerGap = $derived(variant === 'onboarding' ? 'gap-1.5' : 'gap-2');
	let labelTextClass = $derived(variant === 'onboarding' ? 'text-xs sm:text-sm' : 'text-sm');
	let iconSizeClass = $derived(variant === 'onboarding' ? 'h-3.5 w-3.5 sm:h-4 sm:w-4' : 'h-4 w-4');
	let descriptionTextClass = $derived(variant === 'onboarding' ? 'text-[10px] sm:text-[11px]' : 'text-[11px]');
</script>

<div class="space-y-1.5">
	{#if showLabel}
		<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Bond Type</span>
	{/if}
	<div class="grid grid-cols-2 gap-2.5">
		{#each OPTIONS as opt}
			{@const selected = value === opt.id}
			<button
				type="button"
				class="{cardPadding} rounded-2xl border text-left transition-all cursor-pointer {selected
					? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground shadow-xs'
					: 'border-border bg-card/60 text-muted-foreground hover:bg-accent'}"
				onclick={() => onchange(opt.id)}
			>
				<div class="flex items-center {headerGap} font-bold {labelTextClass} text-foreground">
					{#if opt.id === 'romantic'}
						<Heart class="{iconSizeClass} text-rose-500 fill-rose-500/20" />
					{:else}
						<Sparkles class="{iconSizeClass} text-emerald-500 fill-emerald-500/20" />
					{/if}
					<span>{opt.label}</span>
				</div>
				<p class="{descriptionTextClass} text-muted-foreground mt-0.5">
					{variant === 'onboarding' ? opt.descriptionOnboarding : opt.descriptionCompact}
				</p>
			</button>
		{/each}
	</div>
</div>

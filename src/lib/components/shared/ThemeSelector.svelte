<script lang="ts">
	/**
	 * Modern/Cover/Traditional UI theme picker. Was hand-duplicated between
	 * `SettingsSheet.svelte` and `OnboardingFlow.svelte` with different labels,
	 * description copy, and selected-state indicator styles — see REFACTOR_PLAN.md,
	 * High H3. `THEME_REGISTRY` (`$lib/components/themes/registry.ts`) drives the
	 * iteration order but not copy: it carries a third, still-different set of
	 * descriptions used for the theme *registry* itself, and mixing that in here
	 * would change what either caller currently displays.
	 *
	 * `layout="compact"` reproduces Settings' single-line cards (label + inline
	 * check). `layout="detailed"` reproduces the wizard's icon + circular check
	 * badge cards.
	 */
	import type { UIThemeId } from '$lib/types/profile';
	import { THEME_REGISTRY } from '$lib/components/themes/registry';
	import { Sparkles, Image, Heart, Check } from '@lucide/svelte';

	interface Props {
		value: UIThemeId;
		onchange: (theme: UIThemeId) => void;
		layout?: 'compact' | 'detailed';
		/** Settings shows its own "UI Style Theme" label; the onboarding wizard's step
		 * heading ("Choose Your Style") already covers it, so it omits this. */
		showLabel?: boolean;
	}

	let { value, onchange, layout = 'compact', showLabel = true }: Props = $props();

	const COMPACT_META: Record<UIThemeId, { label: string; description: string }> = {
		modern: { label: 'Modern UI', description: 'Cards, glowing avatar & progress metrics' },
		cover: { label: 'Cover Image', description: 'Full-bleed photo, top header names & cards' },
		traditional: { label: 'Traditional', description: 'Original My Love crimson top bar layout' }
	};

	// Not typed as `Record<UIThemeId, ...>` — the `icon` field's type is inferred as
	// the union of the three Lucide component types, which is all it needs to be.
	const DETAILED_META = {
		modern: { label: 'Modern', description: 'Avatar card layout with metrics', icon: Sparkles, iconColor: 'text-primary' },
		cover: { label: 'Cover', description: 'Full-bleed photo with top names', icon: Image, iconColor: 'text-primary' },
		traditional: { label: 'Classic', description: 'My Love crimson bar layout', icon: Heart, iconColor: 'text-rose-600' }
	} satisfies Record<UIThemeId, { label: string; description: string; icon: unknown; iconColor: string }>;

	let gridGapClass = $derived(layout === 'detailed' ? 'gap-2.5 sm:gap-3' : 'gap-2.5');
	let cardPadding = $derived(layout === 'detailed' ? 'p-3.5 sm:p-4' : 'p-3');
	let cardExtra = $derived(layout === 'detailed' ? ' flex flex-col justify-between' : '');
	let unselectedBg = $derived(layout === 'detailed' ? 'bg-card' : 'bg-card/60');
</script>

<div class="space-y-3">
	{#if showLabel}
		<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">UI Style Theme</span>
	{/if}
	<div class="grid grid-cols-1 sm:grid-cols-3 {gridGapClass}">
		{#each THEME_REGISTRY as theme}
			{@const selected = value === theme.id}
			{@const meta = layout === 'detailed' ? DETAILED_META[theme.id] : COMPACT_META[theme.id]}
			<button
				type="button"
				class="{cardPadding} rounded-2xl border text-left transition-all cursor-pointer{cardExtra} {selected
					? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground shadow-xs'
					: `border-border ${unselectedBg} text-foreground hover:bg-accent`}"
				onclick={() => onchange(theme.id)}
			>
				{#if layout === 'detailed'}
					{@const d = DETAILED_META[theme.id]}
					<div class="flex items-center justify-between w-full">
						<div class="flex items-center gap-1.5 font-bold text-sm text-foreground">
							<d.icon class="h-4 w-4 {d.iconColor} shrink-0" />
							<span>{meta.label}</span>
						</div>
						{#if selected}
							<div class="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
								<Check class="h-3 w-3 stroke-[3]" />
							</div>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground mt-2 leading-snug">{meta.description}</p>
				{:else}
					<div class="flex items-center justify-between font-bold text-sm">
						<span>{meta.label}</span>
						{#if selected}
							<Check class="h-4 w-4 text-primary" />
						{/if}
					</div>
					<p class="text-[11px] text-muted-foreground mt-1">{meta.description}</p>
				{/if}
			</button>
		{/each}
	</div>
</div>

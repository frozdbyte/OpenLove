<script lang="ts">
	/**
	 * Modern/Cover/Traditional/Polaroid/Monograph/Botanical/Constellation UI theme picker.
	 * Used in `SettingsSheet.svelte` (compact, expandable) and `OnboardingFlow.svelte`
	 * (detailed, 3 original themes only).
	 *
	 * `layout="compact"` reproduces Settings' single-line cards (label + inline
	 * check). `layout="detailed"` reproduces the wizard's icon + circular check
	 * badge cards.
	 */
	import type { UIThemeId } from '$lib/types/profile';
	import { THEME_REGISTRY } from '$lib/components/themes/registry';
	import { Sparkles, Image, Heart, Camera, BookOpen, Leaf, Star, Check, ChevronDown, ChevronUp } from '@lucide/svelte';

	interface Props {
		value: UIThemeId;
		onchange: (theme: UIThemeId) => void;
		layout?: 'compact' | 'detailed';
		/** Settings shows its own "UI Style Theme" label; the onboarding wizard's step
		 * heading ("Choose Your Style") already covers it, so it omits this. */
		showLabel?: boolean;
		/** Whether to allow expanding to view all available themes (used in Settings, omitted/false in onboarding). */
		allowExpand?: boolean;
	}

	let { value, onchange, layout = 'compact', showLabel = true, allowExpand = false }: Props = $props();

	let isExpanded = $state(false);

	const ORIGINAL_THEME_IDS: UIThemeId[] = ['modern', 'cover', 'traditional'];

	const COMPACT_META: Record<UIThemeId, { label: string; description: string }> = {
		modern: { label: 'Modern UI', description: 'Cards, glowing avatar & progress metrics' },
		cover: { label: 'Cover Image', description: 'Full-bleed photo, top header names & cards' },
		traditional: { label: 'Traditional', description: 'Original My Love crimson top bar layout' },
		polaroid: { label: 'Polaroid', description: 'Analog scrapbook, tilted photo & paper tape' },
		monograph: { label: 'Monograph', description: 'Editorial typography, whitespace & serif type' },
		botanical: { label: 'Botanical', description: 'Zen earth tones, organic curves & calm nature' },
		constellation: { label: 'Constellation', description: 'Starlight sky, glowing celestial orb & astronomy' }
	};

	const DETAILED_META = {
		modern: { label: 'Modern', description: 'Avatar card layout with metrics', icon: Sparkles, iconColor: 'text-primary' },
		cover: { label: 'Cover', description: 'Full-bleed photo with top names', icon: Image, iconColor: 'text-primary' },
		traditional: { label: 'Classic', description: 'My Love crimson bar layout', icon: Heart, iconColor: 'text-rose-600' },
		polaroid: { label: 'Polaroid', description: 'Analog scrapbook & tilted photo', icon: Camera, iconColor: 'text-amber-600 dark:text-amber-400' },
		monograph: { label: 'Monograph', description: 'Editorial typography & serif accents', icon: BookOpen, iconColor: 'text-zinc-600 dark:text-zinc-300' },
		botanical: { label: 'Botanical', description: 'Organic curves & earthy serenity', icon: Leaf, iconColor: 'text-emerald-600 dark:text-emerald-400' },
		constellation: { label: 'Constellation', description: 'Starlit sky & celestial glowing orb', icon: Star, iconColor: 'text-indigo-500 dark:text-indigo-400' }
	} satisfies Record<UIThemeId, { label: string; description: string; icon: unknown; iconColor: string }>;

	let displayedThemes = $derived.by(() => {
		if (!allowExpand) {
			return THEME_REGISTRY.filter((t) => ORIGINAL_THEME_IDS.includes(t.id));
		}
		if (isExpanded) {
			return THEME_REGISTRY;
		}
		// Collapsed state in Settings:
		if (ORIGINAL_THEME_IDS.includes(value)) {
			return THEME_REGISTRY.filter((t) => ORIGINAL_THEME_IDS.includes(t.id));
		}
		// If active theme is not part of the 3 original themes, replace the last default entry (traditional/classic) with selected theme
		const firstTwo = THEME_REGISTRY.filter((t) => t.id === 'modern' || t.id === 'cover');
		const selectedDef = THEME_REGISTRY.find((t) => t.id === value);
		return selectedDef ? [...firstTwo, selectedDef] : firstTwo;
	});

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
		{#each displayedThemes as theme (theme.id)}
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

	{#if allowExpand}
		<button
			type="button"
			class="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-xl border border-dashed border-border/80 transition-colors cursor-pointer"
			onclick={() => (isExpanded = !isExpanded)}
			aria-expanded={isExpanded}
		>
			{#if isExpanded}
				<span>Show fewer themes</span>
				<ChevronUp class="h-3.5 w-3.5" />
			{:else}
				<span>Show all themes ({THEME_REGISTRY.length})</span>
				<ChevronDown class="h-3.5 w-3.5" />
			{/if}
		</button>
	{/if}
</div>

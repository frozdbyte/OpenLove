<script lang="ts">
	/**
	 * The 4-cell Months/Weeks/Days/Hours stat grid. Extracted from
	 * `ModernTheme.svelte`/`CoverTheme.svelte` — see REFACTOR_PLAN.md, H5.
	 * Cover's cards are more compact (smaller padding/icons/text,
	 * `backdrop-blur-md`, `min-w-0` on the text column) — captured as `variant`
	 * rather than unified, per the plan's explicit warning.
	 */
	import type { LucideIcon } from '@lucide/svelte';
	import { Calendar, Sparkles, Heart, Hourglass } from '@lucide/svelte';
	import Card from '$lib/components/ui/card';

	interface Props {
		isFriendship: boolean;
		totalMonths: number;
		totalWeeks: number;
		totalDays: number;
		totalHours: number;
		variant: 'default' | 'compact';
	}

	let { isFriendship, totalMonths, totalWeeks, totalDays, totalHours, variant }: Props = $props();

	let cells = $derived<{ icon: LucideIcon; value: number; label: string }[]>([
		{ icon: Calendar, value: totalMonths, label: 'Months' },
		{ icon: Sparkles, value: totalWeeks, label: 'Weeks' },
		{ icon: isFriendship ? Sparkles : Heart, value: totalDays, label: 'Days' },
		{ icon: Hourglass, value: totalHours, label: 'Hours' }
	]);

	let gridClass = $derived(variant === 'compact' ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-2 gap-3');
	let cardClass = $derived(
		variant === 'compact'
			? 'p-3.5 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm backdrop-blur-md'
			: 'p-4 flex items-center gap-3 bg-card/75 border-border/50 shadow-sm'
	);
	let iconWrapClass = $derived(
		variant === 'compact' ? 'p-2 rounded-2xl bg-primary/10 text-primary shrink-0' : 'p-2.5 rounded-2xl bg-primary/10 text-primary'
	);
	let iconSize = $derived(variant === 'compact' ? 'h-4 w-4' : 'h-5 w-5');
	let textWrapClass = $derived(variant === 'compact' ? 'text-left min-w-0' : 'text-left');
	let valueClass = $derived(variant === 'compact' ? 'text-lg font-bold leading-none' : 'text-xl font-bold leading-none');
	let labelClass = $derived(
		variant === 'compact'
			? 'text-[10px] text-muted-foreground font-medium mt-1'
			: 'text-[11px] text-muted-foreground font-medium mt-1'
	);
</script>

<div class={gridClass}>
	{#each cells as cell}
		<Card class={cardClass}>
			<div class={iconWrapClass}>
				<cell.icon class={iconSize} />
			</div>
			<div class={textWrapClass}>
				<div class={valueClass}>{cell.value.toLocaleString()}</div>
				<div class={labelClass}>{cell.label}</div>
			</div>
		</Card>
	{/each}
</div>

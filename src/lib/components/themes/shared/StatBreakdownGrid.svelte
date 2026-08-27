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
	// `min-w-0` matters here regardless of `Card`'s own base `min-w-0`
	// (`ui/card/card.svelte`) — this div is a *flex child* of the Card's own
	// `flex items-center` row, and a flex child's default `min-width: auto`
	// keeps it at its content's natural width. Without this, a long number
	// (e.g. an old bond's Hours count) doesn't shrink or wrap — it gets
	// silently cropped by Card's `overflow-hidden` instead.
	let textWrapClass = 'text-left min-w-0';
	let labelClass = $derived(
		variant === 'compact'
			? 'text-[10px] text-muted-foreground font-medium mt-1'
			: 'text-[11px] text-muted-foreground font-medium mt-1'
	);

	/**
	 * Steps the value's font size down as its formatted length grows, so a
	 * long-running bond's larger numbers (Hours/Days) shrink to fit instead
	 * of wrapping awkwardly or getting clipped by `Card`'s `overflow-hidden`.
	 * Thresholds are picked off realistic magnitudes: Months/Weeks stay
	 * full-size for any realistic bond age; Days steps down around the
	 * 100-year mark; Hours is the stat most likely to reach the larger
	 * tiers. Each cell sizes independently — e.g. Hours can shrink while
	 * Months stays full-size — since they don't share a text length.
	 */
	function valueSizeClass(value: number): string {
		const chars = value.toLocaleString().length;
		const sizes =
			variant === 'compact' ? ['text-lg', 'text-base', 'text-sm', 'text-xs'] : ['text-xl', 'text-lg', 'text-base', 'text-sm'];
		if (chars > 9) return sizes[3];
		if (chars > 6) return sizes[2];
		if (chars > 3) return sizes[1];
		return sizes[0];
	}
</script>

<div class={gridClass}>
	{#each cells as cell}
		<Card class={cardClass}>
			<div class={iconWrapClass}>
				<cell.icon class={iconSize} />
			</div>
			<div class={textWrapClass}>
				<div class="{valueSizeClass(cell.value)} font-bold leading-none">{cell.value.toLocaleString()}</div>
				<div class={labelClass}>{cell.label}</div>
			</div>
		</Card>
	{/each}
</div>

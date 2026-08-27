<script lang="ts">
	/**
	 * Next-milestone title + days-left + progress bar. Extracted from
	 * `ModernTheme.svelte`/`CoverTheme.svelte` — see REFACTOR_PLAN.md, H5.
	 * Cover's card is more compact and truncates the title / keeps the days-left
	 * label from wrapping (`truncate`, `shrink-0 ml-2`) since it has less
	 * horizontal room over the cover photo — captured as `variant` rather than
	 * unified, per the plan's explicit warning.
	 *
	 * Renders nothing when `nextMilestone` is null, matching both themes'
	 * original `{#if nextMilestone}` guard — callers don't need their own.
	 */
	import type { NextMilestoneInfo } from '$lib/types/time';
	import Card from '$lib/components/ui/card';
	import Progress from '$lib/components/ui/progress';
	import { Trophy } from '@lucide/svelte';

	interface Props {
		nextMilestone: NextMilestoneInfo | null;
		variant: 'default' | 'compact';
	}

	let { nextMilestone, variant }: Props = $props();

	let cardClass = $derived(
		variant === 'compact'
			? 'p-4 bg-card/85 border-border/60 shadow-sm backdrop-blur-md space-y-2.5'
			: 'p-5 bg-card/85 border-border/60 shadow-sm space-y-3'
	);
	let trophyClass = $derived(variant === 'compact' ? 'h-4 w-4 text-primary shrink-0' : 'h-4 w-4 text-primary');
	// `min-w-0` is what actually lets `truncate` below take effect: without
	// it, this flex item keeps its browser-default `min-width: auto` (its
	// content's natural width) and never shrinks, so the title never gets
	// an ellipsis — instead the days-left text (which is `shrink-0`, by
	// design never allowed to shrink itself) gets pushed past the card's
	// width and clipped by `Card`'s `overflow-hidden`. Same root cause as
	// the stat-breakdown grid's number clipping.
	let titleWrapClass = $derived(
		variant === 'compact' ? 'flex items-center gap-1.5 font-semibold text-foreground min-w-0' : 'flex items-center gap-1.5 font-semibold text-foreground'
	);
	let titleClass = $derived(variant === 'compact' ? 'truncate' : '');
	let daysLeftClass = $derived(
		variant === 'compact' ? 'text-muted-foreground font-medium shrink-0 ml-2' : 'text-muted-foreground font-medium'
	);
</script>

{#if nextMilestone}
	<Card class={cardClass}>
		<div class="flex items-center justify-between text-xs">
			<div class={titleWrapClass}>
				<Trophy class={trophyClass} />
				<span class={titleClass}>Next Milestone: {nextMilestone.milestone.title}</span>
			</div>
			<span class={daysLeftClass}>in {nextMilestone.daysLeft} {nextMilestone.daysLeft === 1 ? 'day' : 'days'}</span>
		</div>
		<Progress value={nextMilestone.progressPercentage} max={100} />
		<div class="flex justify-between text-[11px] text-muted-foreground">
			<span>Progress</span>
			<span class="font-semibold text-foreground">{nextMilestone.progressPercentage}%</span>
		</div>
	</Card>
{/if}

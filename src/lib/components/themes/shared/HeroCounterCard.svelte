<script lang="ts">
	/**
	 * Badge + primary-formatted duration + optional ticking-seconds row.
	 * Extracted from `ModernTheme.svelte`/`CoverTheme.svelte` — see
	 * REFACTOR_PLAN.md, H5. The two themes use different sizing/padding tokens
	 * for this "same" card (Cover's is deliberately more compact to leave room
	 * for its cover photo), captured here as `variant` rather than unified,
	 * per the plan's explicit warning not to collapse them.
	 */
	import Card from '$lib/components/ui/card';
	import Badge from '$lib/components/ui/badge';
	import { Clock } from '@lucide/svelte';

	interface Props {
		isFriendship: boolean;
		primaryFormatted: string;
		totalSeconds: number;
		showSeconds: boolean;
		variant: 'default' | 'compact';
	}

	let { isFriendship, primaryFormatted, totalSeconds, showSeconds, variant }: Props = $props();

	let cardClass = $derived(
		variant === 'compact'
			? 'border-primary/20 bg-card/85 backdrop-blur-xl shadow-lg text-center py-3 px-4 sm:py-3.5 sm:px-5 space-y-1'
			: 'border-primary/20 bg-gradient-to-b from-card/90 to-card/60 shadow-lg text-center p-6 space-y-2'
	);
	let badgeClass = $derived(
		variant === 'compact'
			? 'mx-auto uppercase tracking-widest text-[9px] py-0.5 px-2'
			: 'mx-auto uppercase tracking-widest text-[10px]'
	);
	let headingClass = $derived(
		variant === 'compact'
			? 'text-2xl sm:text-3xl font-extrabold text-primary tracking-tight py-0.5'
			: 'text-3xl font-black text-primary tracking-tight py-1'
	);
	let secondsRowClass = $derived(
		variant === 'compact'
			? 'inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/40'
			: 'inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted/60 px-3 py-1 rounded-full border border-border/40'
	);
</script>

<Card class={cardClass}>
	<Badge variant={isFriendship ? 'outline' : 'romantic'} class={badgeClass}>
		{isFriendship ? 'Friends for' : 'Together for'}
	</Badge>
	<h2 class={headingClass}>
		{primaryFormatted}
	</h2>
	{#if showSeconds}
		<div class={secondsRowClass}>
			<Clock class="h-3 w-3 text-primary animate-spin" style="animation-duration: 10s;" />
			<span>{totalSeconds.toLocaleString()} seconds</span>
		</div>
	{/if}
</Card>

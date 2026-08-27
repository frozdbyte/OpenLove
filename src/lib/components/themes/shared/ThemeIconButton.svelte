<script lang="ts">
	/**
	 * Circular header icon button (Settings/Share). Confirmed byte-identical
	 * markup between `ModernTheme.svelte` and `CoverTheme.svelte` except Cover's
	 * buttons carry `shrink-0` — needed there because Cover's header has a
	 * `flex-1 min-w-0` name button between them that would otherwise compress
	 * them under flexbox's default `flex-shrink: 1`. See REFACTOR_PLAN.md, H5.
	 */
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	interface Props {
		icon: LucideIcon;
		onclick: () => void;
		ariaLabel: string;
		shrink?: boolean;
	}

	let { icon: Icon, onclick, ariaLabel, shrink = false }: Props = $props();
</script>

<button
	type="button"
	class={cn(
		'h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all border border-border/40 backdrop-blur-md cursor-pointer',
		shrink && 'shrink-0'
	)}
	{onclick}
	aria-label={ariaLabel}
>
	<Icon class="h-5 w-5" />
</button>

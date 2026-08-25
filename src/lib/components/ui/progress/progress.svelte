<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLAttributes } from "svelte/elements";

	interface Props extends HTMLAttributes<HTMLDivElement> {
		value?: number;
		max?: number;
		class?: string;
	}

	let { value = 0, max = 100, class: className = "", ...restProps }: Props = $props();

	let percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div
	class={cn(
		"relative h-3 w-full overflow-hidden rounded-full bg-secondary/80 border border-border/40 p-0.5",
		className
	)}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={value}
	{...restProps}
>
	<div
		class="h-full rounded-full bg-gradient-to-r from-rose-500 to-primary transition-all duration-700 ease-out shadow-sm"
		style="width: {percentage}%"
	></div>
</div>

<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	interface Props extends HTMLAttributes<HTMLDivElement> {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children, ...restProps }: Props = $props();
</script>

<div
	class={cn(
		"rounded-3xl border border-border/60 bg-card/85 text-card-foreground shadow-sm backdrop-blur-md transition-all",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

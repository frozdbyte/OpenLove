<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	interface Props extends HTMLAttributes<HTMLHeadingElement> {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children, ...restProps }: Props = $props();
</script>

<h3
	class={cn("text-xl font-bold leading-none tracking-tight text-foreground", className)}
	{...restProps}
>
	{@render children?.()}
</h3>

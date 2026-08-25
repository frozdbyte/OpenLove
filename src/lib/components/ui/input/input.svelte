<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLInputAttributes } from "svelte/elements";

	interface Props extends HTMLInputAttributes {
		value?: string | number;
		class?: string;
	}

	let { value = $bindable(), class: className = "", type = "text", ...restProps }: Props = $props();
</script>

<input
	{type}
	bind:value
	class={cn(
		"flex h-11 w-full rounded-2xl border border-border bg-card text-foreground px-4 py-2 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
/>

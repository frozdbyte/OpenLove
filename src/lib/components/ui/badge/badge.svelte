<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "romantic";

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: BadgeVariant;
		class?: string;
		children?: Snippet;
	}

	let { variant = "default", class: className = "", children, ...restProps }: Props = $props();

	const variantStyles: Record<BadgeVariant, string> = {
		default: "border-transparent bg-primary text-primary-foreground shadow",
		secondary: "border-transparent bg-secondary text-secondary-foreground",
		destructive: "border-transparent bg-destructive text-destructive-foreground",
		outline: "text-foreground border-border",
		romantic: "bg-primary/10 border border-primary/20 text-primary"
	};
</script>

<div
	class={cn(
		"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
		variantStyles[variant],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

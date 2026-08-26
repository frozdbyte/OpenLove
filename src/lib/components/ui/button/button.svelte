<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
	type ButtonSize = "default" | "sm" | "lg" | "icon";

	interface Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		children?: Snippet;
	}

	let {
		variant = "default",
		size = "default",
		class: className = "",
		children,
		type = "button",
		...restProps
	}: Props = $props();

	const variantStyles: Record<ButtonVariant, string> = {
		default: "bg-primary text-white shadow-md hover:opacity-95 active:scale-[0.98] font-semibold",
		destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90 font-semibold",
		outline: "border border-border bg-card/80 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground font-medium",
		secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 font-medium",
		ghost: "text-foreground hover:bg-accent hover:text-accent-foreground font-medium",
		link: "text-primary underline-offset-4 hover:underline font-medium"
	};

	const sizeStyles: Record<ButtonSize, string> = {
		default: "h-11 px-5 py-2.5",
		sm: "h-9 rounded-md px-3 text-xs",
		lg: "h-12 rounded-xl px-8 text-base font-semibold",
		icon: "h-10 w-10 p-0"
	};
</script>

<button
	{type}
	class={cn(
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none touch-manipulation",
		variantStyles[variant],
		sizeStyles[size],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>

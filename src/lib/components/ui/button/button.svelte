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
		default: "bg-primary text-primary-foreground shadow hover:bg-primary/90 active:scale-[0.98]",
		destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
		outline: "border border-input bg-background/60 backdrop-blur-sm shadow-sm hover:bg-accent hover:text-accent-foreground",
		secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
		ghost: "hover:bg-accent hover:text-accent-foreground",
		link: "text-primary underline-offset-4 hover:underline"
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
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
		variantStyles[variant],
		sizeStyles[size],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>

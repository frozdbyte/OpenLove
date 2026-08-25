<script lang="ts">
	import { cn } from "$lib/utils";

	interface Props {
		checked?: boolean;
		disabled?: boolean;
		class?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		disabled = false,
		class: className = "",
		onchange
	}: Props = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label="Toggle switch"
	{disabled}
	onclick={toggle}
	class={cn(
		"relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		checked ? "bg-primary" : "bg-muted-foreground/30",
		className
	)}
>
	<span
		class={cn(
			"pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
			checked ? "translate-x-5" : "translate-x-0"
		)}
	></span>
</button>

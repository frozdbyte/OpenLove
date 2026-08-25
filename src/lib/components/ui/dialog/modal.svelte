<script lang="ts">
	import { cn } from "$lib/utils";
	import { X } from "@lucide/svelte";
	import type { Snippet } from "svelte";

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		class?: string;
		children?: Snippet;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		description,
		class: className = "",
		children,
		onclose
	}: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && open) {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
		onclick={close}
	></div>

	<!-- Modal / Sheet Container -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-[2.5rem] border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-xl transition-all sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem]"
		role="dialog"
		aria-modal="true"
	>
		<!-- Header -->
		<div class="flex items-center justify-between pb-4 border-b border-border/40">
			<div>
				{#if title}
					<h2 class="text-xl font-bold font-serif text-foreground">{title}</h2>
				{/if}
				{#if description}
					<p class="text-xs text-muted-foreground mt-0.5">{description}</p>
				{/if}
			</div>
			<button
				type="button"
				class="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
				onclick={close}
				aria-label="Close"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Body -->
		<div class={cn("overflow-y-auto pt-4 space-y-4 max-h-[75vh]", className)}>
			{@render children?.()}
		</div>
	</div>
{/if}

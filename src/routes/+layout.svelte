<script lang="ts">
	import "../app.css";
	import type { Snippet } from "svelte";
	import { pwaStore } from "$lib/stores/pwa.svelte";

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	$effect(() => {
		pwaStore.init();
	});
</script>

<div class="h-dvh min-h-dvh max-h-dvh w-full overflow-x-hidden bg-gradient-to-b from-rose-50/60 via-background to-rose-100/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-foreground transition-colors duration-500 flex flex-col">
	{@render children?.()}
</div>

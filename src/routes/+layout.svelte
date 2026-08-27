<script lang="ts">
	import "../app.css";
	import type { Snippet } from "svelte";
	import { onMount } from "svelte";
	import { pwaStore } from "$lib/stores/pwa.svelte";
	import { networkStore } from "$lib/stores/network.svelte";
	import { featureFlags } from "$lib/stores/featureFlags.svelte";
	import { initSync } from "$lib/sync";
	import { initPushRetry } from "$lib/push/client";
	import PWAToast from "$lib/components/pwa/PWAToast.svelte";
	import { pwaInfo } from "virtual:pwa-info";

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	onMount(() => {
		pwaStore.init();
		networkStore.init();
		void featureFlags.init();
		// Order matters: the push-intent retry has to be registered before the first
		// flush that initSync() kicks off on app start.
		initPushRetry();
		initSync();
	});
</script>

<svelte:head>
	{#if pwaInfo}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

<div class="h-dvh min-h-dvh max-h-dvh w-full overflow-x-hidden bg-gradient-to-b from-rose-50/60 via-background to-rose-100/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-foreground transition-colors duration-500 flex flex-col">
	{@render children?.()}
</div>

<PWAToast />

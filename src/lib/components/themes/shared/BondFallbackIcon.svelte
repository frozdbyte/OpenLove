<script lang="ts">
	/**
	 * "No photo yet" placeholder shown in place of a bond's `<img>`. Every
	 * theme wants the same friendship-vs-romantic icon choice and optional
	 * caption, but keeps its own gradient/sizing/animation classes (they
	 * genuinely differ per theme) — so those are passed in rather than baked
	 * in here.
	 */
	import { Heart, Sparkles } from '@lucide/svelte';

	interface Props {
		isFriendship: boolean;
		containerClass: string;
		iconClass: string;
		caption?: string;
		captionClass?: string;
	}

	let { isFriendship, containerClass, iconClass, caption, captionClass = '' }: Props = $props();
</script>

<div class="h-full w-full flex flex-col items-center justify-center text-primary {containerClass}">
	{#if isFriendship}
		<Sparkles class={iconClass} />
	{:else}
		<Heart class={iconClass} />
	{/if}
	{#if caption}
		<span class={captionClass}>{caption}</span>
	{/if}
</div>

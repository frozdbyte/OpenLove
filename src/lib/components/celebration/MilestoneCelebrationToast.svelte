<script lang="ts">
	import type { Bond } from '$lib/types/bonds';
	import type { MilestoneItem } from '$lib/types/time';
	import Button from '$lib/components/ui/button';
	import { Sparkles, PartyPopper, X } from '@lucide/svelte';
	import { Portal } from 'bits-ui';

	interface Props {
		open?: boolean;
		bond: Bond | null;
		milestone: MilestoneItem | null;
		onCelebrate: (bond: Bond, milestone: MilestoneItem) => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		bond,
		milestone,
		onCelebrate,
		onclose
	}: Props = $props();

	let autoDismissTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (open && bond && milestone) {
			clearTimeout(autoDismissTimer);
			// Auto dismiss after 10 seconds if not interacted with
			autoDismissTimer = setTimeout(() => {
				open = false;
				onclose?.();
			}, 10000);
		}
	});

	function handleDismiss() {
		clearTimeout(autoDismissTimer);
		open = false;
		onclose?.();
	}

	function handleCelebrate() {
		clearTimeout(autoDismissTimer);
		if (bond && milestone) {
			onCelebrate(bond, milestone);
		}
		open = false;
	}
</script>

{#if open && bond && milestone}
<Portal>
	<div
		class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none pb-[max(0.5rem,env(safe-area-inset-bottom))]"
		role="status"
		aria-live="polite"
	>
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-300"
		>
			<div class="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
				<PartyPopper class="h-5 w-5" />
			</div>

			<div class="flex-1 min-w-0 text-left">
				<p class="text-xs font-bold text-primary flex items-center gap-1 uppercase tracking-wider">
					<span>Special Day Today!</span>
				</p>
				<p class="text-sm font-bold text-foreground truncate">
					{bond.names}
				</p>
				<p class="text-xs text-muted-foreground truncate">
					Reached {milestone.title} today 🎉
				</p>
			</div>

			<div class="flex items-center gap-1.5 shrink-0">
				<Button size="sm" class="h-8 px-3 rounded-xl text-xs font-semibold" onclick={handleCelebrate}>
					Celebrate
				</Button>
				<button
					type="button"
					class="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
					onclick={handleDismiss}
					aria-label="Dismiss"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</Portal>
{/if}

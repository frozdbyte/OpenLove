<script lang="ts">
	import { cn } from "$lib/utils";
	import { ArrowLeft, X } from "@lucide/svelte";
	import type { Snippet } from "svelte";

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		class?: string;
		children?: Snippet;
		onclose?: () => void;
		/** Optional back button rendered before the title. Omit to render the
		 * header exactly as before — used by multi-view content (e.g. a
		 * drill-down settings list) to navigate back without closing the modal. */
		onBack?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		description,
		class: className = "",
		children,
		onclose,
		onBack
	}: Props = $props();

	// Internal lifecycle state for 100% flicker-free transitions
	let mounted = $state(false);
	let isVisible = $state(false);
	let isDragging = $state(false);
	let dragY = $state(0);
	let startY = 0;
	let startTime = 0;
	let closeTimeout: ReturnType<typeof setTimeout> | null = null;

	// Watch `open` prop changes from parent
	$effect(() => {
		if (open) {
			if (closeTimeout) clearTimeout(closeTimeout);
			mounted = true;
			dragY = 0;
			isDragging = false;
			// Trigger entrance transition in next tick
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					isVisible = true;
				});
			});
		} else if (mounted && isVisible) {
			handleDismiss();
		}
	});

	function handleDismiss() {
		if (!mounted) return;
		isVisible = false;
		isDragging = false;
		if (closeTimeout) clearTimeout(closeTimeout);
		closeTimeout = setTimeout(() => {
			mounted = false;
			open = false;
			dragY = 0;
			onclose?.();
		}, 260);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && open && isVisible) {
			handleDismiss();
		}
	}

	function handlePointerDown(e: PointerEvent) {
		if (typeof window === "undefined" || window.innerWidth >= 640 || !e.isPrimary || !isVisible) return;
		if ((e.target as HTMLElement)?.closest("button")) return;

		startY = e.clientY;
		startTime = performance.now();
		isDragging = true;
		dragY = 0;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {}
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging) return;
		const delta = e.clientY - startY;
		if (delta > 0) {
			dragY = delta;
		} else {
			dragY = delta * 0.15;
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {}

		const elapsed = performance.now() - startTime;
		const velocity = dragY / Math.max(1, elapsed);

		if (dragY > 90 || (dragY > 35 && velocity > 0.35)) {
			// Dismiss by smoothly continuing slide down to bottom
			handleDismiss();
		} else {
			// Snap back up
			dragY = 0;
		}
	}

	// Lock body scroll while modal is mounted
	$effect(() => {
		if (mounted && typeof document !== "undefined") {
			const body = document.body;
			const html = document.documentElement;
			const prevBodyOverflow = body.style.overflow;
			const prevHtmlOverflow = html.style.overflow;

			body.style.overflow = "hidden";
			html.style.overflow = "hidden";

			return () => {
				body.style.overflow = prevBodyOverflow;
				html.style.overflow = prevHtmlOverflow;
			};
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if mounted}
	<!-- Backdrop with smooth CSS opacity & blur transition -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/60 backdrop-blur-md touch-none overscroll-none select-none transition-opacity duration-250 ease-out"
		class:opacity-100={isVisible && dragY === 0}
		class:opacity-0={!isVisible}
		style:opacity={isVisible && dragY > 0 ? Math.max(0, 1 - dragY / 350) : undefined}
		onclick={handleDismiss}
		ontouchmove={(e) => e.preventDefault()}
	></div>

	<!-- Modal / Sheet Container -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-[2.5rem] border border-border bg-card/95 text-card-foreground p-6 shadow-2xl backdrop-blur-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:rounded-[2rem] will-change-transform overscroll-contain"
		style:transition={isDragging ? 'none' : 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease-out'}
		style:transform={
			!isVisible
				? (typeof window !== 'undefined' && window.innerWidth >= 640 ? 'translate3d(-50%, calc(-50% + 16px), 0) scale(0.95)' : 'translate3d(0, 100%, 0)')
				: (isDragging || dragY > 0)
					? `translate3d(0, ${Math.max(0, dragY)}px, 0)`
					: (typeof window !== 'undefined' && window.innerWidth >= 640 ? 'translate3d(-50%, -50%, 0) scale(1)' : 'translate3d(0, 0%, 0)')
		}
		style:opacity={!isVisible ? '0' : '1'}
		role="dialog"
		aria-modal="true"
	>
		<!-- Drag Zone: Handle & Header Area -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="touch-none select-none cursor-grab active:cursor-grabbing shrink-0 -mt-2"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
		>
			<!-- Mobile Grab Handle Indicator -->
			<div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden"></div>

			<!-- Header -->
			<div class="flex items-center justify-between pb-4 border-b border-border">
				<div class="flex items-center gap-2 min-w-0">
					{#if onBack}
						<button
							type="button"
							class="rounded-full p-2 -ml-2 shrink-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer touch-manipulation"
							onclick={onBack}
							aria-label="Back"
						>
							<ArrowLeft class="h-5 w-5" />
						</button>
					{/if}
					<div class="min-w-0">
						{#if title}
							<h2 class="text-xl font-extrabold text-foreground tracking-tight pointer-events-none truncate">{title}</h2>
						{/if}
						{#if description}
							<p class="text-xs text-muted-foreground mt-0.5 pointer-events-none truncate">{description}</p>
						{/if}
					</div>
				</div>
				<button
					type="button"
					class="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer touch-manipulation"
					onclick={handleDismiss}
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</div>

		<!-- Body with independent scroll containment -->
		<div class={cn("overflow-y-auto pt-4 space-y-4 max-h-[75vh] overscroll-contain", className)}>
			{@render children?.()}
		</div>
	</div>
{/if}

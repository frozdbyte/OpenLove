<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toast.svelte';
	import { CheckCircle2, AlertCircle, Info, X } from '@lucide/svelte';
	import { fly, fade } from 'svelte/transition';
	import { cn } from '$lib/utils';
</script>

{#if toasts.items.length > 0}
	<!-- Toast Container -->
	<div
		class="fixed inset-x-0 bottom-0 z-[60] pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-4 pointer-events-none"
	>
		{#each toasts.items as toast (toast.id)}
			<div
				class={cn(
					'pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md max-w-sm w-full border-l-4 transition-all',
					toast.variant === 'success' && 'border-l-emerald-500',
					toast.variant === 'error' && 'border-l-destructive',
					toast.variant === 'default' && 'border-l-primary'
				)}
				role="status"
				aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
				in:fly={{ y: 16, duration: 220 }}
				out:fade={{ duration: 180 }}
			>
				{#if toast.variant === 'success'}
					<CheckCircle2 class="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
				{:else if toast.variant === 'error'}
					<AlertCircle class="h-5 w-5 shrink-0 text-destructive" />
				{:else}
					<Info class="h-5 w-5 shrink-0 text-primary" />
				{/if}

				<p class="text-sm font-medium text-foreground flex-1 min-w-0">
					{toast.message}
				</p>

				<button
					type="button"
					class="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
					onclick={() => dismissToast(toast.id)}
					aria-label="Dismiss notification"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{/each}
	</div>
{/if}

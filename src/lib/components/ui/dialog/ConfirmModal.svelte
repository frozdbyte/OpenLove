<script lang="ts">
	import Modal from './modal.svelte';
	import Button from '$lib/components/ui/button';

	interface Props {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		variant?: 'destructive' | 'default';
		onConfirm: () => void;
		onCancel?: () => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		variant = 'destructive',
		onConfirm,
		onCancel,
		onclose
	}: Props = $props();

	function handleConfirm() {
		onConfirm();
		open = false;
	}

	function handleCancel() {
		onCancel?.();
		open = false;
	}

	function handleModalClose() {
		onCancel?.();
		onclose?.();
	}
</script>

<Modal bind:open {title} onclose={handleModalClose}>
	<div class="space-y-4 pb-2">
		<p class="text-sm text-muted-foreground leading-relaxed">
			{message}
		</p>

		<div class="flex items-center gap-3 pt-2">
			<Button variant="outline" class="flex-1 h-11 rounded-2xl font-semibold" onclick={handleCancel}>
				<span>{cancelLabel}</span>
			</Button>
			<Button
				variant={variant === 'destructive' ? 'destructive' : 'default'}
				class="flex-1 h-11 rounded-2xl font-semibold"
				onclick={handleConfirm}
			>
				<span>{confirmLabel}</span>
			</Button>
		</div>
	</div>
</Modal>

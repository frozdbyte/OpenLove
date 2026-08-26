<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import { Copy, Check, QrCode, Download, Heart } from '@lucide/svelte';
	import QRCode from 'qrcode';
	import { copyToClipboard } from '$lib/utils/clipboard';

	interface Props {
		open?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

	let qrDataUrl = $state<string>('');
	let copied = $state(false);
	let copiedCode = $state(false);

	$effect(() => {
		if (open && typeof window !== 'undefined') {
			generateQR();
		}
	});

	async function generateQR() {
		try {
			// Export single bond payload for partner invite
			const json = profileStore.exportJSON(true);
			const shareUrl = `${window.location.origin}/#import=${encodeURIComponent(btoa(json))}`;
			qrDataUrl = await QRCode.toDataURL(shareUrl, {
				width: 280,
				margin: 2,
				color: {
					dark: '#8B1E2D',
					light: '#FFFFFF'
				}
			});
		} catch (err) {
			console.error('Failed to generate QR code:', err);
		}
	}

	async function copyShareLink() {
		if (typeof window === 'undefined') return;
		try {
			const json = profileStore.exportJSON(true);
			const shareUrl = `${window.location.origin}/#import=${encodeURIComponent(btoa(json))}`;
			const ok = await copyToClipboard(shareUrl);
			if (ok) {
				copied = true;
				setTimeout(() => {
					copied = false;
				}, 2500);
			}
		} catch (err) {
			console.error('Failed to copy share link:', err);
		}
	}

	async function copySyncCode() {
		if (typeof window === 'undefined') return;
		try {
			const json = profileStore.exportJSON(true);
			const code = btoa(json);
			const ok = await copyToClipboard(code);
			if (ok) {
				copiedCode = true;
				setTimeout(() => {
					copiedCode = false;
				}, 2500);
			}
		} catch (err) {
			console.error('Failed to copy sync code:', err);
		}
	}

	function downloadBackupJSON() {
		if (typeof window === 'undefined') return;
		const json = profileStore.exportJSON(true);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `openlove-share-${profileStore.activeBond.names.replace(/\s+/g, '-').toLowerCase()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<Modal
	bind:open
	title="Share Bond"
	description="Share '{profileStore.activeBond.names}' with your partner or friend"
	{onclose}
>
	<div class="flex flex-col items-center text-center space-y-4 py-2">
		<!-- QR Code -->
		<div class="p-3 bg-white rounded-3xl shadow-md border border-border flex items-center justify-center">
			{#if qrDataUrl}
				<img src={qrDataUrl} alt="Partner QR Code" class="w-48 h-48 rounded-2xl" />
			{:else}
				<div class="w-48 h-48 flex items-center justify-center text-muted-foreground">
					<QrCode class="h-12 w-12 animate-pulse" />
				</div>
			{/if}
		</div>

		<p class="text-xs text-muted-foreground max-w-xs">
			Have them scan this QR code with their camera or from their Open Love app to add this bond.
		</p>

		<!-- Actions -->
		<div class="w-full space-y-2 pt-2">
			<Button class="w-full" onclick={copyShareLink}>
				{#if copied}
					<Check class="h-4 w-4 text-green-300" />
					<span>Copied Link to Clipboard!</span>
				{:else}
					<Copy class="h-4 w-4" />
					<span>Copy Share Link</span>
				{/if}
			</Button>

			<Button variant="outline" class="w-full" onclick={copySyncCode}>
				{#if copiedCode}
					<Check class="h-4 w-4 text-green-500" />
					<span>Copied Sync Code!</span>
				{:else}
					<QrCode class="h-4 w-4" />
					<span>Copy Sync Code (for PWA Paste)</span>
				{/if}
			</Button>

			<Button variant="ghost" size="sm" class="w-full text-xs text-muted-foreground hover:text-foreground" onclick={downloadBackupJSON}>
				<Download class="h-3.5 w-3.5 mr-1" />
				<span>Download Bond JSON File</span>
			</Button>
		</div>
	</div>
</Modal>

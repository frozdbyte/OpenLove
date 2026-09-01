<script lang="ts">
	/**
	 * On-device storage durability and JSON backup/restore/reset. Extracted from
	 * `SettingsSheet.svelte` — see REFACTOR_PLAN.md, High H1. Only ever mounted
	 * when `showAppWideSettings && !isNewBond` and the user has navigated into
	 * the "Data & Backup" section of the settings drawer.
	 *
	 * `open` is threaded through (rather than loading the storage estimate purely
	 * on mount) because `Modal.svelte` keeps its children mounted through its own
	 * ~260ms close animation, during which `open` goes false before the actual
	 * unmount — passing `open` (rather than mount timing alone) keeps the storage
	 * estimate from being needlessly refetched during that closing window.
	 */
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import { getStorageEstimate, type StorageEstimate } from '$lib/utils/storage';
	import { getDeviceOS } from '$lib/utils/pwa';
	import Button from '$lib/components/ui/button';
	import { QrCode, UploadCloud, RotateCcw, Download, HardDrive, CloudOff, ShieldCheck } from '@lucide/svelte';
	import { classifyImportPayload, type ImportPreview } from '$lib/utils/share';
	import JsonImportPreviewDrawer from '$lib/components/share/JsonImportPreviewDrawer.svelte';

	interface Props {
		open: boolean;
		onScanQR: () => void;
		onAfterReset: () => void;
	}

	let { open, onScanQR, onAfterReset }: Props = $props();

	let backupInputRef = $state<HTMLInputElement | null>(null);
	let storage = $state<StorageEstimate | null>(null);
	let pendingFile = $state<File | null>(null);
	let pendingPreview = $state<ImportPreview | null>(null);
	let isPreviewOpen = $state(false);

	$effect(() => {
		if (open) {
			void getStorageEstimate().then((estimate) => (storage = estimate));
		}
	});

	async function downloadBackup() {
		// exportBackupJSON (not the compact exportJSON) embeds every bond's
		// photo inline as base64 — safe for a downloaded file, unlike the
		// QR/link/sync-code payloads, which must stay small.
		const json = await profileStore.exportBackupJSON();
		const filename = `openlove-backup-${new Date().toISOString().split('T')[0]}.json`;

		// iOS Safari (and the in-app browsers built on it) doesn't honour `<a download>`
		// for blob: URLs — it just opens the JSON in its own viewer, leaving the user to
		// find Share > Save to Files themselves. The Web Share API's file support opens
		// that exact same share sheet directly, so route through it there instead.
		// Everywhere else `<a download>` already saves straight to disk, so it's untouched.
		if (getDeviceOS() === 'ios') {
			const file = new File([json], filename, { type: 'application/json' });
			if (navigator.canShare?.({ files: [file] })) {
				try {
					await navigator.share({ files: [file], title: filename });
					return;
				} catch (err: any) {
					// The user dismissing the share sheet also rejects with AbortError —
					// not a failure; anything else falls through to the anchor download.
					if (err?.name === 'AbortError') return;
					console.error('Failed to share backup file, falling back to download:', err);
				}
			}
		}

		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function handleFileSelected(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		target.value = ''; // allow re-selecting the same file after an error
		if (!file) return;

		const text = await file.text();
		const classification = classifyImportPayload(text);
		if (!classification) {
			alert('Failed to restore backup. Invalid file format.');
			return;
		}

		pendingFile = file;
		pendingPreview = classification;
		isPreviewOpen = true;
	}

	async function handleConfirmImport() {
		if (!pendingFile) return;
		const ok = await profileStore.importJSONFromFile(pendingFile);
		isPreviewOpen = false;
		if (ok) {
			alert('Data restored successfully!');
		} else {
			alert('Failed to restore backup. Invalid file format.');
		}
	}

	async function handleResetData() {
		if (confirm('Are you sure you want to reset all data? This will clear all relationships.')) {
			await profileStore.reset();
			onAfterReset();
		}
	}
</script>

<!-- On-device storage durability -->
<section class="p-3.5 rounded-2xl bg-card border border-border space-y-2.5">
	<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
		<HardDrive class="h-4 w-4 text-primary" />
		<span>Data on This Device</span>
	</div>
	<p class="text-xs text-muted-foreground">
		Your names, dates and photos never leave this device. That also means this is the
		only copy — keep a backup.
	</p>

	{#if storage}
		<div class="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
			<span>{storage.usageLabel} used</span>
			<span>{storage.quotaLabel} available</span>
		</div>
	{/if}

	{#if pwaStore.isStoragePersisted}
		<div class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
			<ShieldCheck class="h-3.5 w-3.5 shrink-0" />
			<span>Protected from automatic cleanup</span>
		</div>
	{:else}
		<div class="space-y-2">
			<div class="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
				<CloudOff class="h-3.5 w-3.5 shrink-0 mt-0.5" />
				<span>
					{#if pwaStore.isStandalone}
						Storage is not marked as persistent yet.
					{:else if pwaStore.userOS === 'ios'}
						In a browser tab, iOS can clear this data after ~7 days unused. Install Open Love to your Home Screen to keep it safe.
					{:else}
						In a browser tab, your browser may clear this data if it's unused for a while. Install Open Love as an app to help keep it safe.
					{/if}
				</span>
			</div>
			<Button
				size="sm"
				variant="outline"
				class="w-full h-8 text-xs"
				onclick={() => pwaStore.ensurePersistentStorage()}
			>
				<ShieldCheck class="h-3.5 w-3.5 mr-1.5" />
				<span>Request Persistent Storage</span>
			</Button>
		</div>
	{/if}

	<Button variant="outline" class="w-full" onclick={downloadBackup}>
		<Download class="h-4 w-4 mr-1.5" />
		<span>Download JSON Backup (All Bonds)</span>
	</Button>
</section>

<!-- Backup & Reset -->
<section class="pt-2 border-t border-border space-y-2">
	<Button variant="outline" class="w-full" onclick={onScanQR}>
		<QrCode class="h-4 w-4 mr-1.5" />
		<span>Sync a Bond / Scan QR</span>
	</Button>

	<input
		type="file"
		accept=".json"
		class="hidden"
		bind:this={backupInputRef}
		onchange={handleFileSelected}
	/>
	<Button variant="outline" class="w-full" onclick={() => backupInputRef?.click()}>
		<UploadCloud class="h-4 w-4 mr-1.5" />
		<span>Restore from JSON Backup</span>
	</Button>

	<Button variant="ghost" class="w-full text-destructive hover:bg-destructive/10" onclick={handleResetData}>
		<RotateCcw class="h-4 w-4 mr-1.5" />
		<span>Reset All Data</span>
	</Button>
</section>

<JsonImportPreviewDrawer bind:open={isPreviewOpen} preview={pendingPreview} onConfirm={handleConfirmImport} />

<script lang="ts">
	/**
	 * On-device storage durability, JSON backup/restore/reset, and the app-version
	 * footer. Extracted from `SettingsSheet.svelte` — see REFACTOR_PLAN.md, High H1.
	 * Only ever mounted when `showAppWideSettings && !isNewBond`.
	 *
	 * `open` is threaded through (rather than loading the storage estimate on
	 * mount) because `Modal.svelte` keeps its children mounted through its own
	 * ~260ms close animation and only tears them down after — passing `open`
	 * preserves the original effect's exact re-fire-on-every-open semantics
	 * instead of relying on remount timing.
	 */
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import { getStorageEstimate, type StorageEstimate } from '$lib/utils/storage';
	import Button from '$lib/components/ui/button';
	import {
		QrCode,
		UploadCloud,
		RotateCcw,
		Download,
		HardDrive,
		CloudOff,
		ShieldCheck,
		Heart,
		Code
	} from '@lucide/svelte';
	import { APP_VERSION } from '$lib/version';

	interface Props {
		open: boolean;
		onScanQR: () => void;
		onAfterReset: () => void;
	}

	let { open, onScanQR, onAfterReset }: Props = $props();

	let backupInputRef = $state<HTMLInputElement | null>(null);
	let storage = $state<StorageEstimate | null>(null);

	$effect(() => {
		if (open) {
			void getStorageEstimate().then((estimate) => (storage = estimate));
		}
	});

	function downloadBackup() {
		const blob = new Blob([profileStore.exportJSON()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `openlove-backup-${new Date().toISOString().split('T')[0]}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function handleBackupImport(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			const text = await file.text();
			const ok = await profileStore.importJSON(text);
			if (ok) {
				alert('Data restored successfully!');
			} else {
				alert('Failed to restore backup. Invalid file format.');
			}
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
					{pwaStore.isStandalone
						? 'Storage is not marked as persistent yet.'
						: 'In a browser tab, iOS can clear this data after ~7 days unused. Install Open Love to your Home Screen to keep it safe.'}
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
		<span>Sync with Partner / Scan QR</span>
	</Button>

	<input
		type="file"
		accept=".json"
		class="hidden"
		bind:this={backupInputRef}
		onchange={handleBackupImport}
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

<!-- App Version Indicator -->
<div class="pt-2 pb-1 text-center space-y-1">
	<div class="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground">
		<Heart class="h-3 w-3 text-primary fill-primary/30" />
		<span>Open Love v{APP_VERSION}</span>
	</div>
	<p class="text-[10px] text-muted-foreground/60">Privacy-first & self-hosted
	<br>Made with 🩵 by Frozd</p>
	<a class="text-[10px] text-muted-foreground/40" href="https://github.com/frozdbyte/openlove">
		<Code class="inline size-2.5 mr-0.5" />
		View Source on GitHub
	</a>
</div>

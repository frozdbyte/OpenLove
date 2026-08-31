<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { featureFlags } from '$lib/stores/featureFlags.svelte';
	import { networkStore } from '$lib/stores/network.svelte';
	import { uploadSharedImage, type SharedImageRef } from '$lib/utils/shareImage';
	import { buildShareUrl } from '$lib/utils/share';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Switch from '$lib/components/ui/switch';
	import { Copy, Check, QrCode, Download, Heart, ImageUp, Share2 } from '@lucide/svelte';
	import QRCode from 'qrcode';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { getDeviceOS } from '$lib/utils/pwa';

	interface Props {
		open?: boolean;
		onclose?: () => void;
	}

	let { open = $bindable(false), onclose }: Props = $props();

	// Feature-detected, not assumed from a user-agent/viewport check — true on
	// most mobile browsers and a growing set of desktop ones, absent on the
	// rest. Doesn't change during a session, so a plain const is enough.
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	let qrDataUrl = $state<string>('');
	let copied = $state(false);
	let copiedCode = $state(false);

	// Photo-sharing toggle (IMAGE_SHARING_PLAN.md, Stage 5). Off by default
	// every time the modal opens — an explicit per-share opt-in, independent
	// of the FEATURE_SHARE_IMAGES flag's own server-side default (that flag
	// only gates whether the *option* exists at all).
	let includePhoto = $state(false);
	let uploadingPhoto = $state(false);
	let photoUploadFailed = $state(false);
	// Cached for this modal session so switching between QR / Copy Link /
	// Copy Sync Code never re-uploads the same photo three times.
	let sharedImageRef = $state<SharedImageRef | null>(null);

	$effect(() => {
		if (open) {
			// Fresh session every time the modal opens.
			includePhoto = false;
			uploadingPhoto = false;
			photoUploadFailed = false;
			sharedImageRef = null;
		}
	});

	$effect(() => {
		if (open && typeof window !== 'undefined') {
			includePhoto; // tracked dependency: regenerate when the toggle changes too
			generateQR();
		}
	});

	/**
	 * Builds the compact share payload. Uploads the active bond's photo to
	 * the relay on first use if the toggle is on — lazy, so a share the user
	 * abandons without copying/scanning anything never uploads at all — and
	 * caches the result in `sharedImageRef` for the rest of this session.
	 */
	async function buildShareJson(): Promise<string> {
		if (includePhoto && profileStore.activeBond.photoBlob && !sharedImageRef) {
			uploadingPhoto = true;
			photoUploadFailed = false;
			const uploaded = await uploadSharedImage(profileStore.activeBond.photoBlob);
			uploadingPhoto = false;
			if (uploaded) {
				sharedImageRef = uploaded;
			} else {
				// Fails soft: share still works, just without the photo.
				photoUploadFailed = true;
			}
		}
		return profileStore.exportJSON(true, includePhoto ? (sharedImageRef ?? undefined) : undefined);
	}

	async function generateQR() {
		try {
			const json = await buildShareJson();
			const shareUrl = await buildShareUrl(window.location.origin, json);
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

	/**
	 * Native OS share sheet (Web Share API) — the primary action when
	 * available (mostly mobile), since it's a single tap into Messages/AirDrop/
	 * WhatsApp/etc. rather than copy-then-switch-apps-then-paste. Reuses
	 * buildShareJson() so the "Share Photo" toggle behaves identically
	 * regardless of which action the user ends up tapping.
	 */
	async function shareNative() {
		if (!canShare || typeof window === 'undefined') return;
		try {
			const json = await buildShareJson();
			const shareUrl = await buildShareUrl(window.location.origin, json);
			await navigator.share({
				title: `${profileStore.activeBond.names} on Open Love`,
				text: `Add "${profileStore.activeBond.names}" to Open Love`,
				url: shareUrl
			});
		} catch (err: any) {
			// The user dismissing the share sheet also rejects the promise with
			// AbortError — not a failure, nothing to log or show.
			if (err?.name === 'AbortError') return;
			console.error('Failed to open the share sheet:', err);
		}
	}

	async function copyShareLink() {
		if (typeof window === 'undefined') return;
		try {
			const json = await buildShareJson();
			const shareUrl = await buildShareUrl(window.location.origin, json);
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
			const json = await buildShareJson();
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

	async function downloadBackupJSON() {
		if (typeof window === 'undefined') return;
		// exportBackupJSON (not the compact exportJSON above) embeds the bond's
		// photo inline as base64 — safe for a downloaded file, unlike the
		// QR/link/sync-code payloads, which must stay small.
		const json = await profileStore.exportBackupJSON(true);
		const filename = `openlove-share-${profileStore.activeBond.names.replace(/\s+/g, '-').toLowerCase()}.json`;

		// iOS Safari (and the in-app browsers built on it) doesn't honour `<a download>`
		// for blob: URLs — it just opens the JSON in its own viewer, leaving the user to
		// find Share > Save to Files themselves. The Web Share API's file support opens
		// that exact same share sheet directly, so route through it there instead.
		// Everywhere else `<a download>` already saves straight to disk, so it's untouched.
		// Mirrors StorageBackupPanel.svelte's downloadBackup().
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
					console.error('Failed to share bond JSON file, falling back to download:', err);
				}
			}
		}

		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
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
				<img src={qrDataUrl} alt="Invite QR Code" class="w-48 h-48" />
			{:else}
				<div class="w-48 h-48 flex items-center justify-center text-muted-foreground">
					<QrCode class="h-12 w-12 animate-pulse" />
				</div>
			{/if}
		</div>

		<p class="text-xs text-muted-foreground max-w-xs">
			Have them scan this QR code with their camera or from their Open Love app to add this bond.
		</p>

		{#if featureFlags.flags.shareImages && profileStore.activeBond.photoBlob}
			<!-- Photo-sharing toggle (IMAGE_SHARING_PLAN.md, Stage 5). Disabled
			     while offline — the toggle would just fail soft to "share without
			     it" on upload anyway, but greying it out up front is clearer than
			     letting the user turn it on and only finding out it didn't work
			     once they've already generated/copied a link. -->
			<div
				class="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-card border border-border text-left transition-opacity"
				class:opacity-50={!networkStore.isOnline}
			>
				<div class="flex items-center gap-2.5 min-w-0">
					<div class="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
						<ImageUp class="h-4 w-4" />
					</div>
					<div class="min-w-0">
						<div class="text-sm font-semibold text-foreground">Share Photo</div>
						<p class="text-[11px] text-muted-foreground">
							{#if !networkStore.isOnline}
								Offline — connect to share a photo
							{:else if uploadingPhoto}
								Encrypting &amp; uploading...
							{:else if photoUploadFailed}
								Couldn't upload — sharing without it
							{:else}
								🔒 End-to-End Encrypted
							{/if}
						</p>
					</div>
				</div>
				<Switch
					checked={includePhoto}
					disabled={uploadingPhoto || !networkStore.isOnline}
					onchange={(v) => (includePhoto = v)}
				/>
			</div>
		{/if}

		<!-- Actions -->
		<div class="w-full space-y-2 pt-2">
			{#if canShare}
				<!-- Native share sheet is primary on platforms that support it — a
				     single tap straight into Messages/AirDrop/WhatsApp/etc., rather
				     than copy-then-switch-apps-then-paste. -->
				<Button class="w-full" onclick={shareNative}>
					<Share2 class="h-4 w-4" />
					<span>Share</span>
				</Button>
			{/if}

			<Button variant={canShare ? 'outline' : undefined} class="w-full" onclick={copyShareLink}>
				{#if copied}
					<!-- text-green-300 reads correctly against the solid primary button
					     background (canShare false); once "Copy Share Link" becomes
					     outline (canShare true), it needs the same darker green the
					     already-outline "Copy Sync Code" button below uses. -->
					<Check class="h-4 w-4 {canShare ? 'text-green-500' : 'text-green-300'}" />
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

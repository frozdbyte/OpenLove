<script lang="ts">
	import { profileStore, parseSharePayload } from '$lib/stores/profile.svelte';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input';
	import { Camera, QrCode, Upload, FileText, Check, AlertCircle, Sparkles } from '@lucide/svelte';
	import jsQR from 'jsqr';
	import confetti from 'canvas-confetti';
	import PartnerInviteModal from './PartnerInviteModal.svelte';
	import type { Bond } from '$lib/types/bonds';
	import { decodeSharePayloadString, detectFullBackup } from '$lib/utils/share';

	interface Props {
		open?: boolean;
		onclose?: () => void;
		onSuccess?: () => void;
	}

	let { open = $bindable(false), onclose, onSuccess }: Props = $props();

	let activeTab = $state<'camera' | 'code'>('camera');
	let pasteInput = $state('');
	let errorMessage = $state('');
	let isScanning = $state(false);
	let stream: MediaStream | null = null;
	let animationFrameId: number | null = null;

	let videoRef = $state<HTMLVideoElement | null>(null);
	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Confirmation modal state for configured users
	let isInviteModalOpen = $state(false);
	let pendingIncomingBond = $state<Partial<Bond> | null>(null);
	let pendingRaw = $state('');
	let pendingJson = $state('');

	// Start camera when modal opens on 'camera' tab
	$effect(() => {
		if (open && activeTab === 'camera') {
			startCamera();
		} else {
			stopCamera();
		}

		return () => {
			stopCamera();
		};
	});


	async function startCamera() {
		stopCamera();
		errorMessage = '';

		if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
			errorMessage = 'Camera access is not supported on this device. Please paste your code instead.';
			activeTab = 'code';
			return;
		}

		try {
			isScanning = true;
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 640 },
					height: { ideal: 640 }
				}
			});

			if (videoRef) {
				videoRef.srcObject = stream;
				videoRef.setAttribute('playsinline', 'true');
				await videoRef.play();
				scanFrame();
			}
		} catch (err: any) {
			console.warn('Camera access error:', err);
			isScanning = false;
			errorMessage = 'Camera permission denied or camera not available. Try uploading a screenshot or pasting the code.';
		}
	}

	function stopCamera() {
		isScanning = false;
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
	}

	function scanFrame() {
		if (!isScanning || !videoRef || !canvasRef) return;

		if (videoRef.readyState === videoRef.HAVE_ENOUGH_DATA) {
			const canvas = canvasRef;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });

			if (ctx) {
				canvas.width = videoRef.videoWidth;
				canvas.height = videoRef.videoHeight;
				ctx.drawImage(videoRef, 0, 0, canvas.width, canvas.height);

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const code = jsQR(imageData.data, imageData.width, imageData.height, {
					inversionAttempts: 'dontInvert'
				});

				if (code && code.data) {
					handleImportData(code.data);
					return;
				}
			}
		}

		animationFrameId = requestAnimationFrame(scanFrame);
	}

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files || !target.files[0]) return;

		const file = target.files[0];
		errorMessage = '';

		try {
			const img = new Image();
			const url = URL.createObjectURL(file);

			img.onload = () => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				canvas.width = img.width;
				canvas.height = img.height;
				ctx.drawImage(img, 0, 0);

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const code = jsQR(imageData.data, imageData.width, imageData.height);

				URL.revokeObjectURL(url);

				if (code && code.data) {
					handleImportData(code.data);
				} else {
					errorMessage = 'Could not detect a valid QR code in the selected image.';
				}
			};

			img.src = url;
		} catch (err: any) {
			errorMessage = 'Failed to read image file: ' + err.message;
		}
	}

	async function handleManualImport() {
		if (!pasteInput.trim()) {
			errorMessage = 'Please paste a share link or code';
			return;
		}
		await handleImportData(pasteInput.trim());
	}

	/** Runs the import, celebrates on success, and closes this modal. Shared by
	 * every path that ends in an unconditional `profileStore.importJSON()` call. */
	async function completeImport(json: string, mode: 'replace' | 'add'): Promise<boolean> {
		const success = await profileStore.importJSON(json, mode);
		if (success) {
			stopCamera();
			open = false;
			onSuccess?.();
			if (typeof window !== 'undefined') {
				confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
			}
		}
		return success;
	}

	async function handleImportData(raw: string) {
		errorMessage = '';
		try {
			const jsonString = decodeSharePayloadString(raw);

			// A full multi-bond backup needs different handling than a single-bond
			// invite: it can't be previewed as "one incoming bond", and importing it
			// always replaces the device's entire local state (see detectFullBackup's
			// doc comment) — so it never goes through the Add-as-New/Replace-Current
			// invite flow below, whose buttons would otherwise silently wipe every
			// bond already on this device instead of adding one.
			const fullBackup = detectFullBackup(jsonString);
			if (fullBackup) {
				if (!profileStore.state.isConfigured) {
					// Nothing to lose yet — same as the unconfigured single-bond path.
					const success = await completeImport(jsonString, 'replace');
					if (!success) {
						errorMessage = 'Failed to restore backup. Invalid file format.';
					}
					return;
				}

				const { bondCount } = fullBackup;
				const confirmed = confirm(
					`This code contains a full backup with ${bondCount} relationship${bondCount === 1 ? '' : 's'}/friendship${bondCount === 1 ? '' : 's'}. Importing it will replace ALL bonds currently on this device — this cannot be undone unless you have your own backup. Continue?`
				);
				if (!confirmed) return;

				const success = await completeImport(jsonString, 'replace');
				if (!success) {
					errorMessage = 'Failed to restore backup. Invalid file format.';
				}
				return;
			}

			const parsed = parseSharePayload(raw);
			if (!parsed) {
				errorMessage = 'Invalid relationship profile format. Please check the code and try again.';
				return;
			}

			if (!profileStore.state.isConfigured) {
				// Unconfigured user: import and activate immediately
				await completeImport(jsonString, 'replace');
			} else {
				// Configured user (1 or multiple bonds): show preview and ask to Replace or Add As New
				stopCamera();
				pendingIncomingBond = parsed;
				pendingRaw = raw;
				pendingJson = jsonString;
				isInviteModalOpen = true;
			}
		} catch (err: any) {
			console.error('Failed to import profile data:', err);
			errorMessage = 'Could not parse relationship data. Please verify the code.';
		}
	}

	async function handleAcceptInvite(mode: 'replace' | 'add') {
		if (pendingJson) {
			const success = await profileStore.importJSON(pendingJson, mode);
			if (success) {
				open = false;
				isInviteModalOpen = false;
				onSuccess?.();
				if (typeof window !== 'undefined') {
					confetti({
						particleCount: 120,
						spread: 70,
						origin: { y: 0.6 }
					});
				}
			}
		}
	}

	function handleClose() {
		stopCamera();
		open = false;
		errorMessage = '';
		onclose?.();
	}
</script>


<Modal bind:open title="Sync with Partner" description="Scan partner QR code or paste share link" onclose={handleClose}>
	<div class="space-y-4">
		<!-- Tab Switcher -->
		<div class="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/60 border border-border">
			<button
				type="button"
				class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer {activeTab === 'camera'
					? 'bg-card text-foreground shadow-xs'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => {
					activeTab = 'camera';
					errorMessage = '';
				}}
			>
				<Camera class="h-4 w-4 text-primary" />
				<span>Camera Scanner</span>
			</button>

			<button
				type="button"
				class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer {activeTab === 'code'
					? 'bg-card text-foreground shadow-xs'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => {
					activeTab = 'code';
					stopCamera();
					errorMessage = '';
				}}
			>
				<FileText class="h-4 w-4 text-primary" />
				<span>Paste Link / Code</span>
			</button>
		</div>

		{#if errorMessage}
			<div class="p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2 animate-in fade-in">
				<AlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
				<span>{errorMessage}</span>
			</div>
		{/if}

		{#if activeTab === 'camera'}
			<!-- Live Camera Scanner Tab -->
			<div class="space-y-3">
				<div class="relative w-full aspect-square max-w-[280px] mx-auto rounded-3xl overflow-hidden bg-black flex items-center justify-center border-2 border-primary/40 shadow-inner">
					<video
						bind:this={videoRef}
						class="w-full h-full object-cover"
						autoplay
						muted
						playsinline
					></video>

					<canvas bind:this={canvasRef} class="hidden"></canvas>

					<!-- Scanner Target Frame Overlay -->
					<div class="absolute inset-8 rounded-2xl border-2 border-white/70 pointer-events-none flex items-center justify-center shadow-lg">
						<div class="w-full h-0.5 bg-primary/80 animate-pulse shadow-sm shadow-primary"></div>
					</div>
				</div>

				<p class="text-xs text-muted-foreground text-center">
					Point your camera at the QR code on your partner's phone screen.
				</p>

				<!-- Upload image fallback -->
				<div class="pt-1">
					<input
						type="file"
						accept="image/*"
						class="hidden"
						bind:this={fileInputRef}
						onchange={handlePhotoUpload}
					/>
					<Button variant="outline" size="sm" class="w-full text-xs" onclick={() => fileInputRef?.click()}>
						<Upload class="h-4 w-4 mr-1.5" />
						<span>Scan from Photo / Screenshot</span>
					</Button>
				</div>
			</div>
		{:else}
			<!-- Paste Code / URL Tab -->
			<div class="space-y-3">
				<div class="space-y-1.5">
					<label for="sync-code-input" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Share Link or Sync Code</label>
					<textarea
						id="sync-code-input"
						rows="3"
						bind:value={pasteInput}
						placeholder="Paste partner's share link (https://...) or sync code here"
						class="w-full rounded-2xl border border-border bg-card text-foreground p-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-inner"
					></textarea>
				</div>

				<Button class="w-full h-11 text-sm font-semibold" onclick={handleManualImport}>
					<Sparkles class="h-4 w-4 mr-1.5" />
					<span>Import & Sync Profile</span>
				</Button>
			</div>
		{/if}
	</div>
</Modal>

<PartnerInviteModal
	bind:open={isInviteModalOpen}
	incomingBond={pendingIncomingBond}
	importRaw={pendingRaw}
	onAccept={handleAcceptInvite}
	onclose={() => (isInviteModalOpen = false)}
/>


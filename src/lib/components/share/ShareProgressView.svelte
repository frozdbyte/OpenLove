<script lang="ts">
	/**
	 * "Share Progress" branch of `ShareModal.svelte`'s hub — generates a
	 * Story (9:16) or square (1:1) card image for the active bond via
	 * `shareCardImage.ts` and hands it to the OS share sheet (falling back to
	 * a plain download). Purely client-side: no server round-trip, unlike the
	 * modal's other branch (the partner-invite QR flow's photo relay).
	 */
	import { profileStore } from '$lib/stores/profile.svelte';
	import { calculateTimeBreakdown } from '$lib/utils/time';
	import { generateShareCardImage, type ShareCardFormat, type ShareCardStyle } from '$lib/utils/shareCardImage';
	import { loadShareProgressPrefs, saveShareProgressPrefs } from '$lib/utils/shareProgressPrefs';
	import type { ColorPalette } from '$lib/types/profile';
	import Button from '$lib/components/ui/button';
	import ColorPaletteSelector from '$lib/components/shared/ColorPaletteSelector.svelte';
	import {
		Download,
		Loader2,
		Share2,
		Image as ImageIcon,
		RectangleVertical,
		Square,
		Frame,
		Type,
		Camera,
		Sparkles,
		BookOpen,
		Leaf,
		Layers
	} from '@lucide/svelte';

	const FORMAT_OPTIONS: { value: ShareCardFormat; label: string; icon: typeof RectangleVertical }[] = [
		{ value: 'story', label: 'Story', icon: RectangleVertical },
		{ value: 'square', label: 'Post', icon: Square }
	];

	const STYLE_OPTIONS: { value: ShareCardStyle; label: string; icon: typeof ImageIcon }[] = [
		{ value: 'scrim', label: 'Cover Scrim', icon: ImageIcon },
		{ value: 'framed', label: 'Framed Card', icon: Frame },
		{ value: 'bold', label: 'Bold Typography', icon: Type },
		{ value: 'polaroid', label: 'Polaroid Scrapbook', icon: Camera },
		{ value: 'constellation', label: 'Constellation Starlight', icon: Sparkles },
		{ value: 'monograph', label: 'Editorial Monograph', icon: BookOpen },
		{ value: 'botanical', label: 'Botanical Serenity', icon: Leaf },
		{ value: 'glass', label: 'Frosted Glass', icon: Layers }
	];

	// Last-used format/style/color for *this* bond, remembered locally so
	// reopening the panel doesn't reset to the defaults every time (see
	// shareProgressPrefs.ts). Read once at mount, same as any other
	// per-bond-scoped initial state — this view remounts fresh whenever the
	// hub's `view` returns to 'progress' (see ShareModal.svelte), so a bond
	// switch (which closes the modal first) always reads fresh prefs too.
	const initialPrefs = loadShareProgressPrefs(profileStore.activeBond.id);

	let format = $state<ShareCardFormat>(initialPrefs.format ?? 'story');
	let style = $state<ShareCardStyle>(initialPrefs.style ?? 'scrim');
	let cardColor = $state<ColorPalette>(initialPrefs.colorPalette ?? profileStore.activeBond.colorPalette ?? 'rose');
	let generating = $state(false);
	let imageBlob = $state<Blob | null>(null);
	let previewUrl = $state<string | null>(null);
	let failed = $state(false);

	// Bumped on every requested render. `regenerate()` *serializes* actual
	// generation rather than letting overlapping calls race: a request that
	// arrives while one is already in flight no longer starts a second,
	// overlapping `generateShareCardImage()` call (redundant full-canvas
	// draws if the user toggles Story/Post quickly) — it just bumps this
	// token, and the in-flight call notices the mismatch when it finishes and
	// loops around to render the newer request instead, so at most one
	// generation is ever actually running.
	let renderToken = 0;
	let rendering = false;

	async function regenerate() {
		renderToken++;
		if (rendering) return; // already-running call will pick up this request when it loops
		rendering = true;
		generating = true;
		try {
			for (;;) {
				const runToken = renderToken;
				const runFormat = format;
				const runStyle = style;
				const runColor = cardColor;
				failed = false;
				try {
					const bond = profileStore.activeBond;
					const timeBreakdown = calculateTimeBreakdown(bond.togetherSince);
					const blob = await generateShareCardImage({
						bond,
						timeBreakdown,
						format: runFormat,
						style: runStyle,
						colorPalette: runColor
					});
					if (runToken === renderToken) {
						imageBlob = blob;
						const nextUrl = URL.createObjectURL(blob);
						if (previewUrl) URL.revokeObjectURL(previewUrl);
						previewUrl = nextUrl;
					}
				} catch (err) {
					if (runToken === renderToken) {
						console.error('Failed to generate share card image:', err);
						failed = true;
					}
				}
				// A newer request arrived while this render was in flight -- loop
				// and render it. Otherwise this render is still current: done.
				if (runToken === renderToken) break;
			}
		} finally {
			rendering = false;
			generating = false;
		}
	}

	let currentBondId = $state(profileStore.activeBond.id);
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function updateScrollState() {
		if (!scrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
		const maxScroll = Math.max(0, scrollWidth - clientWidth);
		canScrollLeft = scrollLeft > 3;
		canScrollRight = maxScroll > 3 && scrollLeft < maxScroll - 3;
	}

	$effect(() => {
		if (!scrollContainer) return;
		const el = scrollContainer;
		updateScrollState();

		const handleScroll = () => updateScrollState();
		el.addEventListener('scroll', handleScroll, { passive: true });

		const ro = new ResizeObserver(() => updateScrollState());
		ro.observe(el);

		window.addEventListener('resize', handleScroll, { passive: true });

		return () => {
			el.removeEventListener('scroll', handleScroll);
			ro.disconnect();
			window.removeEventListener('resize', handleScroll);
		};
	});

	const maskStyle = $derived.by(() => {
		const fadeSize = '28px';
		if (canScrollLeft && canScrollRight) {
			const grad = `linear-gradient(to right, transparent 0%, black ${fadeSize}, black calc(100% - ${fadeSize}), transparent 100%)`;
			return `mask-image: ${grad}; -webkit-mask-image: ${grad};`;
		}
		if (canScrollLeft && !canScrollRight) {
			const grad = `linear-gradient(to right, transparent 0%, black ${fadeSize}, black 100%)`;
			return `mask-image: ${grad}; -webkit-mask-image: ${grad};`;
		}
		if (!canScrollLeft && canScrollRight) {
			const grad = `linear-gradient(to right, black 0%, black calc(100% - ${fadeSize}), transparent 100%)`;
			return `mask-image: ${grad}; -webkit-mask-image: ${grad};`;
		}
		return '';
	});

	$effect(() => {
		const newBondId = profileStore.activeBond.id;
		if (newBondId !== currentBondId) {
			currentBondId = newBondId;
			const prefs = loadShareProgressPrefs(newBondId);
			format = prefs.format ?? 'story';
			style = prefs.style ?? 'scrim';
			cardColor = prefs.colorPalette ?? profileStore.activeBond.colorPalette ?? 'rose';
		}
	});

	$effect(() => {
		format; // tracked dependencies: regenerate whenever any of these change
		style;
		cardColor;
		profileStore.activeBond;
		void regenerate();
	});

	// Persist the current choice per-bond on every change (including the
	// first run — re-saving the same defaults back is harmless) so the next
	// time this bond's panel opens, it starts here instead of at the
	// hardcoded defaults.
	$effect(() => {
		saveShareProgressPrefs(profileStore.activeBond.id, { format, style, colorPalette: cardColor });
	});

	// Revoke the last preview URL when this view unmounts (switching back to
	// the hub menu, or closing the modal) — `regenerate()` only revokes the
	// *previous* one on each new render, so the final one needs its own cleanup.
	$effect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	});

	function fileName(): string {
		return `openlove-${profileStore.activeBond.names.replace(/\s+/g, '-').toLowerCase()}-${format}.png`;
	}

	function downloadImage() {
		if (!imageBlob) return;
		const url = URL.createObjectURL(imageBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName();
		a.click();
		URL.revokeObjectURL(url);
	}

	async function shareImage() {
		if (!imageBlob) return;
		const file = new File([imageBlob], fileName(), { type: 'image/png' });
		if (navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: `${profileStore.activeBond.names} on Open Love` });
				return;
			} catch (err: any) {
				// The user dismissing the share sheet also rejects with AbortError —
				// not a failure; anything else falls back to a direct download.
				if (err?.name === 'AbortError') return;
				console.error('Failed to open the share sheet, falling back to download:', err);
			}
		}
		downloadImage();
	}
</script>

<div class="flex flex-col items-center text-center space-y-4 py-2">
	<!-- Format toggle -->
	<div class="inline-flex p-1 rounded-2xl bg-muted/60 border border-border/60 gap-1">
		{#each FORMAT_OPTIONS as opt (opt.value)}
			<button
				type="button"
				class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer {format === opt.value
					? 'bg-card text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (format = opt.value)}
			>
				<opt.icon class="h-3.5 w-3.5" />
				<span>{opt.label}</span>
			</button>
		{/each}
	</div>

	<!-- Preview -->
	<div
		class="relative w-full max-w-[220px] mx-auto rounded-2xl overflow-hidden border border-border shadow-lg bg-muted {format === 'story'
			? 'aspect-[9/16]'
			: 'aspect-square'}"
	>
		{#if previewUrl}
			<img src={previewUrl} alt="Share preview" class="h-full w-full object-cover transition-opacity" class:opacity-40={generating} />
		{/if}
		{#if generating}
			<div class="absolute inset-0 flex items-center justify-center">
				<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{:else if !previewUrl}
			<div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
				<ImageIcon class="h-8 w-8" />
			</div>
		{/if}
	</div>

	{#if failed}
		<p class="text-xs text-destructive">
			Couldn't generate the image —
			<button type="button" class="underline underline-offset-2 hover:no-underline cursor-pointer" onclick={() => regenerate()}>
				try again
			</button>
		</p>
	{/if}

	<!-- Style / Theme picker -->
	<div
		bind:this={scrollContainer}
		class="w-full max-w-[340px] sm:max-w-sm overflow-x-auto py-2 mx-auto scrollbar-none transition-[mask-image] duration-200"
		style={maskStyle}
	>
		<div class="inline-flex items-center gap-3 w-max mx-auto px-3.5 py-1">
			{#each STYLE_OPTIONS as opt (opt.value)}
				<button
					type="button"
					class="h-8 w-8 rounded-full shrink-0 border transition-transform cursor-pointer flex items-center justify-center {style === opt.value
						? 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/30 scale-110 shadow-xs'
						: 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'}"
					onclick={() => (style = opt.value)}
					title={opt.label}
					aria-label={opt.label}
				>
					<opt.icon class="h-4 w-4" />
				</button>
			{/each}
		</div>
	</div>

	<!-- Color override -- one-off for this card, never written back to the bond -->
	<ColorPaletteSelector value={cardColor} onchange={(palette) => (cardColor = palette)} label="Card Color (this share only)" />

	<!-- Actions -->
	<div class="w-full space-y-2 pt-1">
		<Button class="w-full" onclick={shareImage} disabled={!imageBlob || generating}>
			<Share2 class="h-4 w-4" />
			<span>Share</span>
		</Button>
		<Button
			variant="ghost"
			size="sm"
			class="w-full text-xs text-muted-foreground hover:text-foreground"
			onclick={downloadImage}
			disabled={!imageBlob || generating}
		>
			<Download class="h-3.5 w-3.5 mr-1" />
			<span>Download Image</span>
		</Button>
	</div>
</div>

<script lang="ts">
	/**
	 * Pure preview + confirm UI shown between "a JSON backup file was
	 * selected" and "it's actually imported" — used by both
	 * `OverviewStep.svelte` (onboarding's restore shortcut) and
	 * `StorageBackupPanel.svelte` (Settings' restore button). Never calls
	 * `profileStore.importJSON()`/`importJSONFromFile()` itself; the caller
	 * owns the actual mutation (via `onConfirm`) and its own post-import
	 * success/failure feedback, since the two callers want different UX
	 * there (inline text vs `alert()`).
	 *
	 * Avatar cloud + per-bond icon/color styling deliberately mirrors
	 * `BondSwitcherDrawer.svelte`'s established romantic (rose/Heart) vs
	 * friendship (emerald/Sparkles) convention, so a bond reads the same way
	 * here as it will once it's actually in the app.
	 */
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge';
	import { Heart, Sparkles, TriangleAlert, Info } from '@lucide/svelte';
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { ImportPreview, ImportPreviewBond } from '$lib/utils/share';
	import type { ColorPalette } from '$lib/types/profile';

	interface Props {
		open: boolean;
		preview: ImportPreview | null;
		onConfirm: () => void;
	}

	let { open = $bindable(false), preview, onConfirm }: Props = $props();

	let bonds = $derived(preview?.bonds ?? []);
	let bondCount = $derived(bonds.length);
	let cloudBonds = $derived(bonds.slice(0, 3));
	let overflowCount = $derived(Math.max(0, bondCount - 3));
	let isOverwrite = $derived(preview?.kind === 'full-backup' && profileStore.state.isConfigured);
	let isAdditive = $derived(preview?.kind !== 'full-backup' && profileStore.state.isConfigured);
	let description = $derived(bondCount === 1 ? '1 bond will be restored' : `${bondCount} bonds will be restored`);

	/** The "type bubble"'s and glow's colors — tied to each bond's own
	 * accent color choice, not its romantic/friendship type (unlike the
	 * avatar fallback icon below, which stays type-colored to match
	 * `BondSwitcherDrawer.svelte`). Literal class strings, not
	 * template-interpolated, so Tailwind's scanner can see them — same
	 * approach `ColorPaletteSelector.svelte`'s `PALETTES` array uses. */
	const PALETTE_COLORS: Record<ColorPalette, { text: string; border: string; bg: string; glow: string }> = {
		rose: { text: 'text-rose-500', border: 'border-rose-500/80', bg: 'bg-rose-500/15', glow: 'bg-rose-500' },
		lavender: { text: 'text-purple-500', border: 'border-purple-500/80', bg: 'bg-purple-500/15', glow: 'bg-purple-500' },
		terracotta: { text: 'text-orange-600', border: 'border-orange-600/80', bg: 'bg-orange-600/15', glow: 'bg-orange-600' },
		sage: { text: 'text-emerald-600', border: 'border-emerald-600/80', bg: 'bg-emerald-600/15', glow: 'bg-emerald-600' },
		midnight: { text: 'text-blue-600', border: 'border-blue-600/80', bg: 'bg-blue-600/15', glow: 'bg-blue-600' }
	};
</script>

{#snippet avatarImage(bond: ImportPreviewBond)}
	{#if bond.photoDataUrl}
		<img src={bond.photoDataUrl} alt={bond.names} class="h-full w-full object-cover" />
	{:else if bond.type === 'friendship'}
		<div class="h-full w-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
			<Sparkles class="h-1/2 w-1/2" />
		</div>
	{:else}
		<div class="h-full w-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-500">
			<Heart class="h-1/2 w-1/2 fill-rose-500/20" />
		</div>
	{/if}
{/snippet}

{#snippet avatarUnit(bond: ImportPreviewBond, size: 'lg' | 'sm')}
	{@const colors = PALETTE_COLORS[bond.colorPalette]}
	{@const circleSize = size === 'lg' ? 'h-20 w-20' : 'h-12 w-12'}
	{@const glowInset = size === 'lg' ? '-inset-2' : '-inset-1.5'}
	{@const glowBlur = size === 'lg' ? 'blur-xl' : 'blur-md'}
	{@const bubbleSize = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'}
	{@const bubbleIconSize = size === 'lg' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'}
	<div class="relative {circleSize}">
		<!-- Glow: z-0, isolated to this avatar's own stacking context (this
		     wrapper is `relative` with no z-index of its own, but every
		     *sibling* avatar unit is placed in an absolutely-positioned,
		     explicitly z-indexed wrapper — see below — which creates a new
		     stacking context, so this glow can never paint in front of
		     another avatar, only ever behind its own). -->
		<div class="absolute {glowInset} rounded-full {glowBlur} opacity-50 {colors.glow} z-0"></div>
		<div class="relative {circleSize} rounded-full overflow-hidden border-4 border-card shadow-lg bg-muted z-10">
			{@render avatarImage(bond)}
		</div>
		<!-- Type bubble: a subtler, palette-colored take on
		     `BondSwitcherDrawer.svelte`'s corner "selected" checkmark badge —
		     thin ~80%-opacity colored border, low-opacity colored fill, the
		     bond's type icon instead of a checkmark. -->
		<div
			class="absolute -bottom-1 -right-1 {bubbleSize} rounded-full border {colors.border} {colors.bg} backdrop-blur-sm flex items-center justify-center z-20"
		>
			{#if bond.type === 'friendship'}
				<Sparkles class="{bubbleIconSize} {colors.text}" />
			{:else}
				<Heart class="{bubbleIconSize} {colors.text}" />
			{/if}
		</div>
	</div>
{/snippet}

<Modal bind:open title="Import Backup?" {description}>
	{#if preview}
		<!-- Avatar cloud: the primary bond is centered horizontally and
		     defines the reference box (`relative`, sized to the primary
		     avatar); the smaller avatars are `absolute` children of that
		     same box, each in its own explicitly z-indexed wrapper so the
		     whole floating avatar — including its own glow — paints in
		     front of the primary as one unit. Capped at 3 images, with a
		     "+N" badge for anything beyond that. -->
		<div class="flex justify-center py-3">
			<div class="relative">
				{@render avatarUnit(cloudBonds[0], 'lg')}

				{#if cloudBonds[1]}
					<div class="absolute -left-8 top-0 z-30">
						{@render avatarUnit(cloudBonds[1], 'sm')}
					</div>
				{/if}
				{#if cloudBonds[2]}
					<div class="absolute -right-8 top-0 z-30">
						{@render avatarUnit(cloudBonds[2], 'sm')}
					</div>
				{/if}
				{#if overflowCount > 0}
					<div
						class="absolute -right-2 -bottom-2 h-8 w-8 rounded-full border-4 border-card shadow-md bg-foreground text-background flex items-center justify-center text-[10px] font-bold z-40"
					>
						+{overflowCount}
					</div>
				{/if}
			</div>
		</div>

		<div class="space-y-1.5">
			{#each bonds as bond}
				<div class="flex items-center gap-2.5 p-2.5 rounded-2xl bg-card/70 border border-border">
					<div class="h-9 w-9 rounded-full overflow-hidden shrink-0">
						{@render avatarImage(bond)}
					</div>
					<span class="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{bond.names}</span>
					<Badge variant={bond.type === 'friendship' ? 'outline' : 'romantic'} class="text-[10px] py-0 px-1.5 shrink-0">
						{#if bond.type === 'friendship'}
							🌿 Friend
						{:else}
							💖 Couple
						{/if}
					</Badge>
				</div>
			{/each}
		</div>

		{#if isOverwrite}
			<div class="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive">
				<TriangleAlert class="h-4 w-4 shrink-0 mt-0.5" />
				<p class="text-xs font-medium leading-relaxed">
					Importing will replace ALL {profileStore.state.bonds.length}
					{profileStore.state.bonds.length === 1 ? 'bond' : 'bonds'} currently on this device —
					this cannot be undone unless you have your own backup.
				</p>
			</div>
		{:else if isAdditive}
			<div class="flex items-start gap-2 p-3 rounded-xl bg-muted/60 border border-border text-muted-foreground">
				<Info class="h-4 w-4 shrink-0 mt-0.5" />
				<p class="text-xs font-medium leading-relaxed">This will be added as a new bond.</p>
			</div>
		{/if}

		<div class="flex gap-2 pt-1">
			<Button variant="outline" class="flex-1" onclick={() => (open = false)}>Cancel</Button>
			<Button variant={isOverwrite ? 'destructive' : 'default'} class="flex-1" onclick={onConfirm}>
				{isOverwrite ? 'Overwrite & Restore' : 'Restore'}
			</Button>
		</div>
	{/if}
</Modal>

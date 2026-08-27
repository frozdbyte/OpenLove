<script lang="ts">
	/**
	 * Step 3 of `OnboardingFlow.svelte`'s wizard: bond type + names. Extracted per
	 * REFACTOR_PLAN.md, Medium M5.
	 */
	import type { BondType } from '$lib/types/bonds';
	import Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input';
	import BondTypeSelector from '$lib/components/shared/BondTypeSelector.svelte';
	import { Heart, Sparkles, QrCode } from '@lucide/svelte';

	interface Props {
		bondType: BondType;
		namesInput: string;
		onBondTypeChange: (type: BondType) => void;
		onScanQR: () => void;
	}

	let { bondType, namesInput = $bindable(), onBondTypeChange, onScanQR }: Props = $props();
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full {bondType === 'friendship'
		? 'bg-emerald-100 dark:bg-emerald-950/60 shadow-emerald-500/10'
		: 'bg-rose-100 dark:bg-rose-950/60 shadow-rose-500/10'} flex items-center justify-center text-primary shadow-md shrink-0">
		{#if bondType === 'friendship'}
			<Sparkles class="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500" />
		{:else}
			<Heart class="h-6 w-6 sm:h-8 sm:w-8 fill-primary animate-heartbeat" />
		{/if}
	</div>

	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
			{bondType === 'friendship' ? 'Friend Names' : 'Your Names'}
		</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">
			What are your names or nicknames?
		</p>
	</div>

	<!-- Bond Type Selector -->
	<BondTypeSelector value={bondType} onchange={onBondTypeChange} variant="onboarding" showLabel={false} />

	<Card class="p-4 sm:p-5 bg-card border-border shadow-sm rounded-2xl">
		<div class="space-y-2 text-left">
			<label for="onboarding-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
				{bondType === 'friendship' ? 'Friend Names' : 'Couple Names'}
			</label>
			<Input
				id="onboarding-names"
				placeholder={bondType === 'friendship' ? 'e.g. Alex & Sam' : 'e.g. Emma & Paul'}
				bind:value={namesInput}
				class="text-base"
			/>
			<p class="text-[11px] text-muted-foreground pt-0.5">Stored 100% locally on your device for privacy.</p>
		</div>
	</Card>

	<div>
		<button
			type="button"
			class="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
			onclick={onScanQR}
		>
			<QrCode class="h-3.5 w-3.5" />
			<span>Sync with Partner / Scan QR Code</span>
		</button>
	</div>
</div>

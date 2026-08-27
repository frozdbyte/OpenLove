<script lang="ts">
	/**
	 * Step 4 of `OnboardingFlow.svelte`'s wizard: together-since date. Extracted
	 * per REFACTOR_PLAN.md, Medium M5.
	 */
	import type { BondType } from '$lib/types/bonds';
	import Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input';
	import { Calendar } from '@lucide/svelte';

	interface Props {
		bondType: BondType;
		dateInput: string;
	}

	let { bondType, dateInput = $bindable() }: Props = $props();
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full {bondType === 'friendship'
		? 'bg-emerald-100 dark:bg-emerald-950/60 shadow-emerald-500/10'
		: 'bg-rose-100 dark:bg-rose-950/60 shadow-rose-500/10'} flex items-center justify-center shadow-md shrink-0">
		<Calendar class="h-6 w-6 sm:h-8 sm:w-8 {bondType === 'friendship' ? 'text-emerald-500' : 'text-primary'}" />
	</div>

	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
			{bondType === 'friendship' ? 'Friends Since' : 'Together Since'}
		</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">
			{bondType === 'friendship' ? 'When did your friendship begin?' : 'When did your special journey begin?'}
		</p>
	</div>

	<Card class="p-4 sm:p-5 bg-card border-border shadow-sm w-full min-w-0 max-w-full overflow-hidden rounded-2xl">
		<div class="space-y-2 text-left w-full min-w-0 max-w-full overflow-hidden">
			<label for="onboarding-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
				{bondType === 'friendship' ? 'Friendship Start Date' : 'Anniversary Date'}
			</label>
			<Input
				id="onboarding-date"
				type="date"
				bind:value={dateInput}
				class="text-base w-full min-w-0 max-w-full"
			/>
		</div>
	</Card>
</div>

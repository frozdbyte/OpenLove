<script lang="ts">
	/**
	 * Per-bond notification toggle + milestone-category preferences. Extracted from
	 * `SettingsSheet.svelte` — see REFACTOR_PLAN.md, High H1/H2.
	 *
	 * H2: the six category-toggle handlers each rebuilt the full
	 * `MilestoneCategoryPrefs` object by hand (10 lines apiece, verbatim except for
	 * one field). `updatePrefs()` below is the single shared implementation —
	 * verified field-by-field against all six original handlers to produce
	 * byte-identical output (the original per-handler `?? true`/`?? 'all'`
	 * fallbacks were dead code whenever `currentBond.milestonePrefs` is defined,
	 * which it always is for a real bond; `updatePrefs` reproduces the same
	 * fallback for the case it isn't).
	 */
	import type { Bond, DaysMilestoneFilter, MilestoneCategoryPrefs } from '$lib/types/bonds';
	import { DEFAULT_MILESTONE_PREFS_ROMANTIC } from '$lib/types/bonds';
	import Switch from '$lib/components/ui/switch';
	import { BellRing, PartyPopper, Sparkles, Trophy, HeartHandshake } from '@lucide/svelte';

	interface Props {
		isNewBond: boolean;
		currentBond: Bond;
		notificationsEnabled: boolean;
		years: boolean;
		months: boolean;
		days: DaysMilestoneFilter;
		custom: boolean;
		onNotificationsChange: (enabled: boolean) => void;
		onPrefsChange: (prefs: MilestoneCategoryPrefs) => void;
	}

	let {
		isNewBond,
		currentBond,
		notificationsEnabled = $bindable(),
		years = $bindable(),
		months = $bindable(),
		days = $bindable(),
		custom = $bindable(),
		onNotificationsChange,
		onPrefsChange
	}: Props = $props();

	let displayedNotificationsEnabled = $derived(
		isNewBond ? notificationsEnabled : (currentBond.notificationsEnabled ?? true)
	);
	let displayedYears = $derived(isNewBond ? years : (currentBond.milestonePrefs?.years ?? true));
	let displayedMonths = $derived(
		isNewBond ? months : (currentBond.milestonePrefs?.months ?? (currentBond.type === 'friendship' ? false : true))
	);
	let displayedCustom = $derived(isNewBond ? custom : (currentBond.milestonePrefs?.custom ?? true));
	let currentDays = $derived<DaysMilestoneFilter>(
		isNewBond ? days : (currentBond.milestonePrefs?.days ?? (currentBond.type === 'friendship' ? 'major' : 'all'))
	);

	function handleNotificationsToggle(v: boolean) {
		notificationsEnabled = v;
		if (!isNewBond) onNotificationsChange(v);
	}

	function updatePrefs(patch: Partial<MilestoneCategoryPrefs>) {
		if (patch.years !== undefined) years = patch.years;
		if (patch.months !== undefined) months = patch.months;
		if (patch.days !== undefined) days = patch.days;
		if (patch.custom !== undefined) custom = patch.custom;
		if (isNewBond) return;
		const base = currentBond.milestonePrefs ?? DEFAULT_MILESTONE_PREFS_ROMANTIC;
		onPrefsChange({ ...base, ...patch });
	}
</script>

<!-- Push Notifications & Milestone Categories (Configured Per-Bond) -->
<section class="p-3.5 rounded-2xl bg-card border border-border space-y-3">
	<div class="flex items-center justify-between">
		<div class="space-y-0.5">
			<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
				<BellRing class="h-4 w-4 text-primary" />
				<span>Bond Notifications</span>
			</div>
			<div class="text-xs text-muted-foreground">Alert on milestones for this relationship</div>
		</div>
		<Switch checked={displayedNotificationsEnabled} onchange={handleNotificationsToggle} />
	</div>

	{#if displayedNotificationsEnabled}
		<div class="pt-2 border-t border-border/50 space-y-2.5">
			<span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
				Milestone Categories
			</span>

			<!-- Year Anniversaries -->
			<div class="flex items-center justify-between text-xs text-foreground">
				<div class="flex items-center gap-2">
					<PartyPopper class="h-3.5 w-3.5 text-amber-500" />
					<span>Yearly Anniversaries (1st, 2nd, 5th...)</span>
				</div>
				<Switch checked={displayedYears} onchange={(v) => updatePrefs({ years: v })} />
			</div>

			<!-- Month Milestones -->
			<div class="flex items-center justify-between text-xs text-foreground">
				<div class="flex items-center gap-2">
					<Sparkles class="h-3.5 w-3.5 text-rose-500" />
					<span>Monthly Milestones (1st–11th mo, 18mo...)</span>
				</div>
				<Switch checked={displayedMonths} onchange={(v) => updatePrefs({ months: v })} />
			</div>

			<!-- Day Milestones -->
			<div class="space-y-2 pt-1.5">
				<!-- Row 1: Label + Switch -->
				<div class="flex items-center justify-between text-xs">
					<div class="flex items-center gap-2 font-semibold text-foreground">
						<Trophy class="h-4 w-4 text-amber-500 shrink-0" />
						<span>Day Milestones</span>
					</div>
					<Switch
						checked={currentDays !== 'off'}
						onchange={(v) => updatePrefs({ days: v ? 'all' : 'off' })}
					/>
				</div>

				<!-- Row 2: 2-option segment, only shown when days !== 'off' -->
				{#if currentDays !== 'off'}
					<div class="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/60">
						<button
							type="button"
							class="flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all cursor-pointer {currentDays === 'all'
								? 'bg-card text-foreground font-bold shadow-xs ring-1 ring-border/50'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => updatePrefs({ days: 'all' })}
						>
							<span class="text-xs font-semibold">All Days</span>
							<span class="text-[10px] opacity-70 font-normal mt-0.5">50, 100, 200…</span>
						</button>
						<button
							type="button"
							class="flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all cursor-pointer {currentDays === 'major'
								? 'bg-card text-foreground font-bold shadow-xs ring-1 ring-border/50'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => updatePrefs({ days: 'major' })}
							title="Only 1,000+ days (1000, 2500, 5000…)"
						>
							<span class="text-xs font-semibold">Major Only</span>
							<span class="text-[10px] opacity-70 font-normal mt-0.5">1k, 2.5k, 5k…</span>
						</button>
					</div>
				{/if}
			</div>

			<!-- Custom Moments -->
			<div class="flex items-center justify-between text-xs text-foreground">
				<div class="flex items-center gap-2">
					<HeartHandshake class="h-3.5 w-3.5 text-primary" />
					<span>Custom Moments</span>
				</div>
				<Switch checked={displayedCustom} onchange={(v) => updatePrefs({ custom: v })} />
			</div>
		</div>
	{/if}
</section>

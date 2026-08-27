<script lang="ts">
	/**
	 * Step 6 (final) of `OnboardingFlow.svelte`'s wizard: theme, color mode, and
	 * push opt-in. Extracted per REFACTOR_PLAN.md, Medium M5.
	 *
	 * `selectedTheme`/`selectedColorMode` stay props rather than local state
	 * because the parent's `nextStep()`/`finishOnboarding()` need their final
	 * values when the wizard completes; `onThemeChange`/`onColorModeChange` are
	 * the parent's existing handlers, which also live-apply the choice via
	 * `profileStore.setUITheme`/`setColorMode` so the app re-themes in real time
	 * as the user picks — that side effect has to run regardless of where the
	 * state lives, so it stays put rather than moving into this step.
	 *
	 * Push opt-in state (`pushOptedIn`/`pushLoading`) is only ever read here, so
	 * it's fully local.
	 */
	import type { UIThemeId, ColorMode } from '$lib/types/profile';
	import { subscribeToPush } from '$lib/push/client';
	import Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button';
	import ThemeSelector from '$lib/components/shared/ThemeSelector.svelte';
	import ColorModeSelector from '$lib/components/shared/ColorModeSelector.svelte';
	import { BellRing } from '@lucide/svelte';

	interface Props {
		selectedTheme: UIThemeId;
		selectedColorMode: ColorMode;
		onThemeChange: (theme: UIThemeId) => void;
		onColorModeChange: (mode: ColorMode) => void;
	}

	let { selectedTheme, selectedColorMode, onThemeChange, onColorModeChange }: Props = $props();

	let pushOptedIn = $state(false);
	let pushLoading = $state(false);

	async function handleOnboardingPushToggle() {
		pushLoading = true;
		try {
			const res = await subscribeToPush();
			if (res.success) {
				pushOptedIn = true;
			}
		} catch (err) {
			console.error('Failed to subscribe to push during onboarding:', err);
		} finally {
			pushLoading = false;
		}
	}
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Choose Your Style</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">Customize your appearance and notifications</p>
	</div>

	<div class="space-y-3 text-left">
		<!-- Theme selector cards -->
		<ThemeSelector value={selectedTheme} layout="detailed" showLabel={false} onchange={onThemeChange} />

		<!-- Dark mode selector -->
		<ColorModeSelector value={selectedColorMode} layout="detailed" showLabel onchange={onColorModeChange} />

		<!-- Push Notification Opt-in -->
		<Card class="p-3.5 sm:p-4 bg-card border-border flex items-center justify-between gap-3 text-left rounded-2xl">
			<div class="flex items-center gap-3 min-w-0 flex-1">
				<div class="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
					<BellRing class="h-5 w-5" />
				</div>
				<div class="space-y-0.5 min-w-0 flex-1">
					<div class="text-xs sm:text-sm font-bold text-foreground truncate">Anniversary Reminders</div>
					<p class="text-[11px] sm:text-xs text-muted-foreground truncate">Get notified on special milestones</p>
				</div>
			</div>
			{#if pushOptedIn}
				<span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-xl shrink-0">✓ Enabled</span>
			{:else}
				<Button size="sm" variant="outline" class="h-8 px-3 text-xs font-semibold rounded-xl shrink-0" onclick={handleOnboardingPushToggle} disabled={pushLoading}>
					<span>Enable</span>
				</Button>
			{/if}
		</Card>
	</div>
</div>

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
	 * No longer has a push opt-in card here — superseded by the dedicated
	 * post-onboarding `EnableNotificationsPrompt.svelte`, shown right after
	 * onboarding finishes instead of being buried in the theme picker.
	 */
	import type { UIThemeId, ColorMode } from '$lib/types/profile';
	import ThemeSelector from '$lib/components/shared/ThemeSelector.svelte';
	import ColorModeSelector from '$lib/components/shared/ColorModeSelector.svelte';

	interface Props {
		selectedTheme: UIThemeId;
		selectedColorMode: ColorMode;
		onThemeChange: (theme: UIThemeId) => void;
		onColorModeChange: (mode: ColorMode) => void;
	}

	let { selectedTheme, selectedColorMode, onThemeChange, onColorModeChange }: Props = $props();
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Choose Your Style</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">Customize your appearance</p>
	</div>

	<div class="space-y-3 text-left">
		<!-- Theme selector cards -->
		<ThemeSelector value={selectedTheme} layout="detailed" showLabel={false} onchange={onThemeChange} />

		<!-- Dark mode selector -->
		<ColorModeSelector value={selectedColorMode} layout="detailed" showLabel onchange={onColorModeChange} />
	</div>
</div>

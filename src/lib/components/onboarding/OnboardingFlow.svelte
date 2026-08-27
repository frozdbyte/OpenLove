<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import type { UIThemeId, ColorMode } from '$lib/types/profile';
	import Button from '$lib/components/ui/button';
	import { Sparkles, ArrowRight, ArrowLeft } from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import ScanImportModal from '$lib/components/share/ScanImportModal.svelte';
	import {
		type BondType,
		DEFAULT_MILESTONE_PREFS_FRIENDSHIP,
		DEFAULT_MILESTONE_PREFS_ROMANTIC
	} from '$lib/types/bonds';
	import OverviewStep from './steps/OverviewStep.svelte';
	import PwaInstallStep from './steps/PwaInstallStep.svelte';
	import NamesStep from './steps/NamesStep.svelte';
	import DateStep from './steps/DateStep.svelte';
	import PhotoStep from './steps/PhotoStep.svelte';
	import StyleStep from './steps/StyleStep.svelte';

	type OnboardingStepKey = 'overview' | 'pwa_install' | 'names' | 'date' | 'photo' | 'style';

	let currentStepIndex = $state(0);
	let isScanModalOpen = $state(false);

	let installSuccess = $state(false);
	let showAddressBarTip = $state(false);

	// If running as standalone PWA, omit the PWA installation step
	let steps = $derived<OnboardingStepKey[]>(
		pwaStore.isStandalone
			? ['overview', 'names', 'date', 'photo', 'style']
			: ['overview', 'pwa_install', 'names', 'date', 'photo', 'style']
	);

	let currentStepKey = $derived<OnboardingStepKey>(steps[currentStepIndex] || 'overview');
	let totalSteps = $derived(steps.length);
	let stepDisplayNumber = $derived(currentStepIndex + 1);

	let bondType = $state<BondType>('romantic');
	let namesInput = $state(profileStore.profile.names || 'Emma & Paul');
	let dateInput = $state(profileStore.profile.togetherSince || new Date().toISOString().split('T')[0]);
	let selectedTheme = $state<UIThemeId>(profileStore.profile.uiTheme || 'modern');
	let selectedColorMode = $state<ColorMode>(profileStore.profile.colorMode || 'system');

	function handleBondTypeChange(newType: BondType) {
		bondType = newType;
		if (newType === 'romantic' && namesInput === 'Alex & Sam') {
			namesInput = 'Emma & Paul';
		} else if (newType === 'friendship' && namesInput === 'Emma & Paul') {
			namesInput = 'Alex & Sam';
		}
	}

	function handleThemeChange(theme: UIThemeId) {
		selectedTheme = theme;
		profileStore.setUITheme(theme);
	}

	function handleColorModeChange(mode: ColorMode) {
		selectedColorMode = mode;
		profileStore.setColorMode(mode);
	}

	async function handleInstallPWA() {
		const outcome = await pwaStore.promptInstall();
		if (outcome === 'accepted') {
			installSuccess = true;
			if (typeof window !== 'undefined') {
				confetti({
					particleCount: 80,
					spread: 60,
					origin: { y: 0.6 }
				});
			}
		} else if (outcome === 'unavailable') {
			showAddressBarTip = true;
		}
	}

	async function nextStep() {
		if (currentStepKey === 'names') {
			if (!namesInput.trim()) return;
			await profileStore.update({ names: namesInput.trim() });
		} else if (currentStepKey === 'date') {
			if (!dateInput) return;
			await profileStore.update({ togetherSince: dateInput });
		} else if (currentStepKey === 'style') {
			await profileStore.update({
				uiTheme: selectedTheme,
				colorMode: selectedColorMode
			});
		}

		if (currentStepIndex < totalSteps - 1) {
			currentStepIndex++;
		} else {
			finishOnboarding();
		}
	}

	function prevStep() {
		if (currentStepIndex > 0) {
			currentStepIndex--;
		}
	}

	async function finishOnboarding() {
		await profileStore.updateBond(profileStore.activeBond.id, {
			type: bondType,
			names: namesInput.trim(),
			togetherSince: dateInput,
			milestonePrefs:
				bondType === 'friendship'
					? DEFAULT_MILESTONE_PREFS_FRIENDSHIP
					: DEFAULT_MILESTONE_PREFS_ROMANTIC,
			uiTheme: selectedTheme,
			colorMode: selectedColorMode
		});

		await profileStore.update({
			names: namesInput.trim(),
			togetherSince: dateInput,
			uiTheme: selectedTheme,
			colorMode: selectedColorMode,
			isConfigured: true
		});

		// IndexedDB now holds the only copy of this couple's data. Ask for an eviction
		// exemption here, immediately after a real user gesture — Chrome weighs
		// engagement signals, so this is the moment most likely to be granted silently.
		void pwaStore.ensurePersistentStorage();

		if (typeof window !== 'undefined') {
			confetti({
				particleCount: 120,
				spread: 70,
				origin: { y: 0.6 }
			});
		}
	}

</script>

<div class="h-full max-h-[100dvh] w-full flex flex-col justify-between max-w-md mx-auto px-4 pt-3 sm:pt-6 overflow-hidden">
	<!-- Top Bar Progress Indicator -->
	<header class="w-full flex items-center justify-between pb-2 sm:pb-3 shrink-0">
		<div class="flex items-center gap-2">
			{#if currentStepIndex > 0}
				<button
					type="button"
					class="p-1.5 -ml-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors cursor-pointer"
					onclick={prevStep}
					aria-label="Previous step"
				>
					<ArrowLeft class="h-4 w-4 sm:h-5 sm:w-5" />
				</button>
			{/if}
			<span class="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Step {stepDisplayNumber} of {totalSteps}</span>
		</div>

		<!-- Step dots -->
		<div class="flex items-center gap-1.5">
			{#each Array(totalSteps) as _, i}
				<div
					class="h-1.5 sm:h-2 rounded-full transition-all duration-300 {i === currentStepIndex
						? 'w-5 sm:w-6 bg-primary'
						: i < currentStepIndex
							? 'w-1.5 sm:w-2 bg-primary/60'
							: 'w-1.5 sm:w-2 bg-muted-foreground/30'}"
				></div>
			{/each}
		</div>
	</header>

	<!-- Wizard Step Content -->
	<main class="my-auto flex-1 flex flex-col justify-center min-h-0 overflow-y-auto w-full py-1 sm:py-2">
		{#if currentStepKey === 'overview'}
			<OverviewStep onScanQR={() => (isScanModalOpen = true)} />
		{:else if currentStepKey === 'pwa_install'}
			<PwaInstallStep
				{installSuccess}
				{showAddressBarTip}
				onInstall={handleInstallPWA}
				onScanQR={() => (isScanModalOpen = true)}
			/>
		{:else if currentStepKey === 'names'}
			<NamesStep
				{bondType}
				bind:namesInput
				onBondTypeChange={handleBondTypeChange}
				onScanQR={() => (isScanModalOpen = true)}
			/>
		{:else if currentStepKey === 'date'}
			<DateStep {bondType} bind:dateInput />
		{:else if currentStepKey === 'photo'}
			<PhotoStep {bondType} />
		{:else if currentStepKey === 'style'}
			<StyleStep
				{selectedTheme}
				{selectedColorMode}
				onThemeChange={handleThemeChange}
				onColorModeChange={handleColorModeChange}
			/>
		{/if}
	</main>

	<!-- Bottom Action Button with safe bottom padding -->
	<footer class="pt-2 shrink-0 w-full" style="padding-bottom: max(1.75rem, env(safe-area-inset-bottom, 1.75rem));">
		<Button class="w-full h-11 sm:h-12 text-base font-semibold cursor-pointer shadow-md" size="lg" onclick={nextStep}>
			{#if currentStepIndex === totalSteps - 1}
				<Sparkles class="h-5 w-5 mr-1.5" />
				<span>Finish Setup</span>
			{:else if currentStepKey === 'overview'}
				<span>Get Started</span>
				<ArrowRight class="h-5 w-5 ml-1.5" />
			{:else if currentStepKey === 'pwa_install'}
				<span>{installSuccess || pwaStore.isInstalled ? 'Continue' : 'Continue in Browser'}</span>
				<ArrowRight class="h-5 w-5 ml-1.5" />
			{:else}
				<span>Continue</span>
				<ArrowRight class="h-5 w-5 ml-1.5" />
			{/if}
		</Button>
	</footer>
</div>

<ScanImportModal bind:open={isScanModalOpen} />

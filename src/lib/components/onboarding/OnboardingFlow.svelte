<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import type { UIThemeId, ColorMode } from '$lib/types/profile';
	import Button from '$lib/components/ui/button';
	import Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input';
	import {
		Heart,
		Calendar,
		Upload,
		Trash2,
		Sparkles,
		Check,
		ArrowRight,
		ArrowLeft,
		Sun,
		Moon,
		Monitor,
		Smartphone,
		BellRing,
		Share2,
		QrCode,
		ShieldCheck,
		Lock,
		Download
	} from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import { subscribeToPush } from '$lib/push/client';
	import ScanImportModal from '$lib/components/share/ScanImportModal.svelte';

	type OnboardingStepKey = 'overview' | 'pwa_install' | 'names' | 'date' | 'photo' | 'style';

	let currentStepIndex = $state(0);
	let isScanModalOpen = $state(false);

	let userOS = $derived(pwaStore.userOS);
	let installSuccess = $state(false);

	// If running as standalone PWA, omit the PWA installation step
	let steps = $derived<OnboardingStepKey[]>(
		pwaStore.isStandalone
			? ['overview', 'names', 'date', 'photo', 'style']
			: ['overview', 'pwa_install', 'names', 'date', 'photo', 'style']
	);

	let currentStepKey = $derived<OnboardingStepKey>(steps[currentStepIndex] || 'overview');
	let totalSteps = $derived(steps.length);
	let stepDisplayNumber = $derived(currentStepIndex + 1);

	let namesInput = $state(profileStore.profile.names || 'Emma & Paul');
	let dateInput = $state(profileStore.profile.togetherSince || new Date().toISOString().split('T')[0]);
	let selectedTheme = $state<UIThemeId>(profileStore.profile.uiTheme || 'modern');
	let selectedColorMode = $state<ColorMode>(profileStore.profile.colorMode || 'system');
	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Push notification state during onboarding
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

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			await profileStore.setPhoto(target.files[0]);
		}
	}

	let showAddressBarTip = $state(false);

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
		await profileStore.update({
			names: namesInput.trim(),
			togetherSince: dateInput,
			uiTheme: selectedTheme,
			colorMode: selectedColorMode,
			isConfigured: true
		});

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
			<!-- Step 1: App Overview & Privacy Focus -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
					<Heart class="h-6 w-6 sm:h-8 sm:w-8 fill-primary text-primary animate-heartbeat" />
				</div>

				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Welcome to Open Love</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">A private, romantic space to celebrate your journey</p>
				</div>

				<!-- Feature Highlights with Privacy Emphasis -->
				<div class="space-y-2 text-left">
					<!-- Feature 1: Privacy (Highlighted) -->
					<Card class="p-3 sm:p-3.5 bg-card/90 border-primary/25 shadow-xs flex items-start gap-3 rounded-2xl ring-1 ring-primary/10">
						<div class="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
							<ShieldCheck class="h-4 w-4 sm:h-5 sm:w-5" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
								<span>100% Private & Zero-Knowledge</span>
							</div>
							<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
								Your names, dates, notes, and photos stay strictly on this device in IndexedDB. No ads, tracking, or cloud data harvesting.
							</p>
						</div>
					</Card>

					<!-- Feature 2: Milestones & Timers -->
					<Card class="p-3 sm:p-3.5 bg-card border-border shadow-xs flex items-start gap-3 rounded-2xl">
						<div class="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
							<Calendar class="h-4 w-4 sm:h-5 sm:w-5" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="text-xs sm:text-sm font-bold text-foreground">
								Live Timers & Milestones
							</div>
							<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
								Exact years, months, and days together with smart countdowns for anniversaries and custom memories.
							</p>
						</div>
					</Card>

					<!-- Feature 3: Offline PWA & Partner Sync -->
					<Card class="p-3 sm:p-3.5 bg-card border-border shadow-xs flex items-start gap-3 rounded-2xl">
						<div class="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
							<Sparkles class="h-4 w-4 sm:h-5 sm:w-5" />
						</div>
						<div class="space-y-0.5 min-w-0">
							<div class="text-xs sm:text-sm font-bold text-foreground">
								Themes & Private Sync
							</div>
							<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
								Works offline, supports Modern & Classic themes, and syncs seamlessly with your partner via private QR code.
							</p>
						</div>
					</Card>
				</div>

				<div class="pt-0.5">
					<button
						type="button"
						class="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
						onclick={() => (isScanModalOpen = true)}
					>
						<QrCode class="h-3.5 w-3.5" />
						<span>Have an invite? Scan Partner QR</span>
					</button>
				</div>
			</div>
		{:else if currentStepKey === 'pwa_install'}
			<!-- Step: Install Open Love as PWA -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
					<Smartphone class="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
				</div>

				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Install Open Love</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">Add to your home screen for the full app experience</p>
				</div>

				{#if installSuccess || pwaStore.isInstalled}
					<!-- Installation Success Feedback -->
					<Card class="p-4 sm:p-5 bg-emerald-500/10 border-emerald-500/30 text-center space-y-2 rounded-2xl animate-in fade-in zoom-in-95 duration-300">
						<div class="h-10 w-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
							<Check class="h-6 w-6 stroke-[3]" />
						</div>
						<div class="text-sm font-bold text-emerald-600 dark:text-emerald-400">Open Love Installed!</div>
						<p class="text-xs text-muted-foreground">
							You can now launch Open Love directly from your home screen or continue setting up right here.
						</p>
					</Card>
				{:else if userOS !== 'ios'}
					<!-- 1-Click PWA Installation Callout (Chromium on Android / Desktop) -->
					<Card class="p-4 sm:p-5 bg-card border-primary/30 shadow-md text-center space-y-3 rounded-2xl ring-1 ring-primary/15">
						<div class="space-y-1">
							<div class="text-sm font-bold text-foreground">Fast 1-Click Install</div>
							<p class="text-xs text-muted-foreground leading-relaxed">
								Install Open Love directly to your device for instant offline access, standalone view, and anniversary alerts.
							</p>
						</div>

						<Button
							type="button"
							class="w-full h-11 sm:h-12 text-sm sm:text-base font-bold shadow-md gap-2 cursor-pointer"
							size="lg"
							onclick={handleInstallPWA}
						>
							<Download class="h-5 w-5" />
							<span>Install App Now</span>
						</Button>

						{#if showAddressBarTip}
							<p class="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl text-left leading-snug">
								{#if userOS === 'android'}
									Tap the <strong class="text-foreground">three dots (⋮)</strong> in Chrome and choose <strong class="text-foreground">"Install app"</strong>.
								{:else}
									Click the <strong class="text-foreground">Install App icon (⊕)</strong> in your browser address bar to install.
								{/if}
							</p>
						{/if}
					</Card>
				{:else}
					<!-- iOS Safari Manual Installation Guide -->
					<Card class="p-3.5 sm:p-4 bg-card border-border shadow-sm text-left space-y-2.5 rounded-2xl">
						<div class="flex items-start gap-2.5">
							<div class="p-1.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
								<Share2 class="h-4 w-4" />
							</div>
							<div class="text-xs space-y-0.5">
								<div class="font-bold text-foreground">iPhone & iPad (Safari):</div>
								<p class="text-muted-foreground leading-snug">
									Tap the <strong class="text-foreground">Share</strong> icon at the bottom of Safari, then tap <strong class="text-foreground">"Add to Home Screen"</strong>.
								</p>
							</div>
						</div>
					</Card>
				{/if}

				<p class="text-[11px] text-muted-foreground">
					Installed? Open it from your home screen, or continue setup right here in your browser.
				</p>

				<div class="pt-0.5">
					<button
						type="button"
						class="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
						onclick={() => (isScanModalOpen = true)}
					>
						<QrCode class="h-3.5 w-3.5" />
						<span>Sync with Partner / Scan QR</span>
					</button>
				</div>
			</div>
		{:else if currentStepKey === 'names'}
			<!-- Step: Names -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
					<Heart class="h-6 w-6 sm:h-8 sm:w-8 fill-primary animate-heartbeat" />
				</div>

				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Your Names</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">What are your names or nicknames?</p>
				</div>

				<Card class="p-4 sm:p-5 bg-card border-border shadow-sm rounded-2xl">
					<div class="space-y-2 text-left">
						<label for="onboarding-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Couple Names</label>
						<Input
							id="onboarding-names"
							placeholder="e.g. Emma & Paul"
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
						onclick={() => (isScanModalOpen = true)}
					>
						<QrCode class="h-3.5 w-3.5" />
						<span>Sync with Partner / Scan QR Code</span>
					</button>
				</div>
			</div>
		{:else if currentStepKey === 'date'}
			<!-- Step: Date -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
					<Calendar class="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
				</div>

				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Together Since</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">When did your special journey begin?</p>
				</div>

				<Card class="p-4 sm:p-5 bg-card border-border shadow-sm w-full min-w-0 max-w-full overflow-hidden rounded-2xl">
					<div class="space-y-2 text-left w-full min-w-0 max-w-full overflow-hidden">
						<label for="onboarding-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Anniversary Date</label>
						<Input
							id="onboarding-date"
							type="date"
							bind:value={dateInput}
							class="text-base w-full min-w-0 max-w-full"
						/>
					</div>
				</Card>
			</div>
		{:else if currentStepKey === 'photo'}
			<!-- Step: Photo -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Add a Couple Picture</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">Make your tracker uniquely yours (optional)</p>
				</div>

				<Card class="p-3.5 sm:p-5 bg-card border-border shadow-sm flex flex-col items-center space-y-3 rounded-2xl">
					<div class="relative h-24 w-24 sm:h-32 sm:w-32 rounded-2xl overflow-hidden bg-muted border-2 border-dashed border-border flex items-center justify-center shadow-inner group shrink-0">
						{#if profileStore.profile.photoUrl}
							<img src={profileStore.profile.photoUrl} alt="Preview" class="h-full w-full object-cover" />
						{:else}
							<Upload class="h-8 w-8 text-muted-foreground/60 group-hover:scale-110 transition-transform" />
						{/if}
					</div>

					<input
						type="file"
						accept="image/*"
						class="hidden"
						bind:this={fileInputRef}
						onchange={handlePhotoUpload}
					/>

					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => fileInputRef?.click()}>
							<Upload class="h-3.5 w-3.5 mr-1" />
							<span>{profileStore.profile.photoUrl ? 'Change' : 'Upload'}</span>
						</Button>

						{#if profileStore.profile.photoUrl}
							<Button variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => profileStore.setPhoto(null)}>
								<Trash2 class="h-3.5 w-3.5 mr-1" />
								<span>Remove</span>
							</Button>
						{/if}
					</div>
				</Card>
			</div>
		{:else if currentStepKey === 'style'}
			<!-- Step: UI Theme, Dark Mode & Notifications -->
			<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
				<div class="space-y-1">
					<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Choose Your Style</h1>
					<p class="text-xs sm:text-sm text-muted-foreground">Customize your appearance and notifications</p>
				</div>

				<div class="space-y-3 text-left">
					<!-- Theme selector cards -->
					<div class="grid grid-cols-2 gap-2.5 sm:gap-3">
						<button
							type="button"
							class="p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between {selectedTheme === 'modern'
								? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground shadow-xs'
								: 'border-border bg-card text-foreground hover:bg-accent'}"
							onclick={() => {
								selectedTheme = 'modern';
								profileStore.setUITheme('modern');
							}}
						>
							<div class="flex items-center justify-between w-full">
								<div class="flex items-center gap-1.5 font-bold text-sm text-foreground">
									<Sparkles class="h-4 w-4 text-primary shrink-0" />
									<span>Modern</span>
								</div>
								{#if selectedTheme === 'modern'}
									<div class="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
										<Check class="h-3 w-3 stroke-[3]" />
									</div>
								{/if}
							</div>
							<p class="text-xs text-muted-foreground mt-2 leading-snug">Card layout with progress rings</p>
						</button>

						<button
							type="button"
							class="p-3.5 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between {selectedTheme === 'traditional'
								? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground shadow-xs'
								: 'border-border bg-card text-foreground hover:bg-accent'}"
							onclick={() => {
								selectedTheme = 'traditional';
								profileStore.setUITheme('traditional');
							}}
						>
							<div class="flex items-center justify-between w-full">
								<div class="flex items-center gap-1.5 font-bold text-sm text-foreground">
									<Heart class="h-4 w-4 text-rose-600 shrink-0" />
									<span>Classic</span>
								</div>
								{#if selectedTheme === 'traditional'}
									<div class="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
										<Check class="h-3 w-3 stroke-[3]" />
									</div>
								{/if}
							</div>
							<p class="text-xs text-muted-foreground mt-2 leading-snug">Crimson top bar layout</p>
						</button>
					</div>

					<!-- Dark mode selector -->
					<div>
						<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Color Appearance</span>
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								class="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border transition-all cursor-pointer {selectedColorMode === 'system'
									? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
									: 'border-border bg-card text-foreground hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'system';
									profileStore.setColorMode('system');
								}}
							>
								<Monitor class="h-4 w-4 sm:h-5 sm:w-5 {selectedColorMode === 'system' ? 'text-primary' : 'text-muted-foreground'}" />
								<span class="text-xs font-medium">System</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border transition-all cursor-pointer {selectedColorMode === 'light'
									? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
									: 'border-border bg-card text-foreground hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'light';
									profileStore.setColorMode('light');
								}}
							>
								<Sun class="h-4 w-4 sm:h-5 sm:w-5 {selectedColorMode === 'light' ? 'text-primary' : 'text-muted-foreground'}" />
								<span class="text-xs font-medium">Light</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border transition-all cursor-pointer {selectedColorMode === 'dark'
									? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
									: 'border-border bg-card text-foreground hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'dark';
									profileStore.setColorMode('dark');
								}}
							>
								<Moon class="h-4 w-4 sm:h-5 sm:w-5 {selectedColorMode === 'dark' ? 'text-primary' : 'text-muted-foreground'}" />
								<span class="text-xs font-medium">Dark</span>
							</button>
						</div>
					</div>

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

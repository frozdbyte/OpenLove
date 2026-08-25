<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { UIThemeId, ColorMode } from '$lib/types/profile';
	import Button from '$lib/components/ui/button';
	import Card, { CardContent } from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input';
	import Badge from '$lib/components/ui/badge';
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
		Bell,
		BellRing,
		Share2
	} from '@lucide/svelte';
	import confetti from 'canvas-confetti';
	import { subscribeToPush, isPushSupported } from '$lib/push/client';

	let step = $state(1);
	const totalSteps = 5;

	let namesInput = $state(profileStore.profile.names || 'Emma & Paul');
	let dateInput = $state(profileStore.profile.togetherSince || new Date().toISOString().split('T')[0]);
	let selectedTheme = $state<UIThemeId>(profileStore.profile.uiTheme || 'modern');
	let selectedColorMode = $state<ColorMode>(profileStore.profile.colorMode || 'system');
	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Push state during onboarding
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
			console.error(err);
		} finally {
			pushLoading = false;
		}
	}

	// Detect OS for PWA installation guide
	let userOS = $state<'ios' | 'android' | 'desktop'>('desktop');

	$effect(() => {
		if (typeof window !== 'undefined') {
			const ua = window.navigator.userAgent.toLowerCase();
			if (/iphone|ipad|ipod/.test(ua)) {
				userOS = 'ios';
			} else if (/android/.test(ua)) {
				userOS = 'android';
			} else {
				userOS = 'desktop';
			}
		}
	});

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			await profileStore.setPhoto(target.files[0]);
		}
	}

	async function nextStep() {
		if (step === 1) {
			if (!namesInput.trim()) return;
			await profileStore.update({ names: namesInput.trim() });
		} else if (step === 2) {
			if (!dateInput) return;
			await profileStore.update({ togetherSince: dateInput });
		} else if (step === 4) {
			await profileStore.update({
				uiTheme: selectedTheme,
				colorMode: selectedColorMode
			});
		}

		if (step < totalSteps) {
			step++;
		} else {
			finishOnboarding();
		}
	}

	function prevStep() {
		if (step > 1) {
			step--;
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

		// Trigger celebration confetti
		if (typeof window !== 'undefined') {
			confetti({
				particleCount: 120,
				spread: 70,
				origin: { y: 0.6 }
			});
		}
	}
</script>

<div class="min-h-screen w-full flex flex-col justify-between max-w-md mx-auto px-4 py-8">
	<!-- Top Bar Progress Indicator -->
	<header class="w-full flex items-center justify-between pb-4">
		<div class="flex items-center gap-2">
			{#if step > 1}
				<button
					type="button"
					class="p-2 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors cursor-pointer"
					onclick={prevStep}
					aria-label="Previous step"
				>
					<ArrowLeft class="h-5 w-5" />
				</button>
			{/if}
			<span class="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Step {step} of {totalSteps}</span>
		</div>

		<!-- Step dots -->
		<div class="flex items-center gap-1.5">
			{#each Array(totalSteps) as _, i}
				<div
					class="h-2 rounded-full transition-all duration-300 {i + 1 === step
						? 'w-6 bg-primary'
						: i + 1 < step
							? 'w-2 bg-primary/60'
							: 'w-2 bg-muted-foreground/30'}"
				></div>
			{/each}
		</div>
	</header>

	<!-- Wizard Step Content -->
	<main class="my-auto py-4">
		{#if step === 1}
			<!-- Step 1: Names -->
			<div class="space-y-6 text-center animate-in fade-in duration-300">
				<div class="h-20 w-20 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-lg shadow-rose-500/10">
					<Heart class="h-10 w-10 fill-primary animate-heartbeat" />
				</div>

				<div class="space-y-2">
					<h1 class="text-3xl font-extrabold text-foreground tracking-tight">Welcome to OpenLove</h1>
					<p class="text-sm text-muted-foreground">What are your names or nicknames?</p>
				</div>

				<Card class="p-6 bg-card border-border shadow-md">
					<div class="space-y-2 text-left">
						<label for="onboarding-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Names</label>
						<Input
							id="onboarding-names"
							placeholder="e.g. Emma & Paul"
							bind:value={namesInput}
							class="text-base"
						/>
						<p class="text-[11px] text-muted-foreground pt-1">Stored 100% locally in your browser for privacy.</p>
					</div>
				</Card>
			</div>
		{:else if step === 2}
			<!-- Step 2: Date -->
			<div class="space-y-6 text-center animate-in fade-in duration-300">
				<div class="h-20 w-20 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-lg shadow-rose-500/10">
					<Calendar class="h-10 w-10 text-primary" />
				</div>

				<div class="space-y-2">
					<h1 class="text-3xl font-extrabold text-foreground tracking-tight">Together Since</h1>
					<p class="text-sm text-muted-foreground">When did your special journey begin?</p>
				</div>

				<Card class="p-6 bg-card border-border shadow-md">
					<div class="space-y-2 text-left">
						<label for="onboarding-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Anniversary Date</label>
						<Input
							id="onboarding-date"
							type="date"
							bind:value={dateInput}
							class="text-base"
						/>
					</div>
				</Card>
			</div>
		{:else if step === 3}
			<!-- Step 3: Photo -->
			<div class="space-y-6 text-center animate-in fade-in duration-300">
				<div class="space-y-2">
					<h1 class="text-3xl font-extrabold text-foreground tracking-tight">Add a Couple Picture</h1>
					<p class="text-sm text-muted-foreground">Make your tracker uniquely yours (optional)</p>
				</div>

				<Card class="p-6 bg-card border-border shadow-md flex flex-col items-center space-y-4">
					<div class="relative h-36 w-36 rounded-3xl overflow-hidden bg-muted border-2 border-dashed border-border flex items-center justify-center shadow-inner group">
						{#if profileStore.profile.photoUrl}
							<img src={profileStore.profile.photoUrl} alt="Preview" class="h-full w-full object-cover" />
						{:else}
							<Upload class="h-10 w-10 text-muted-foreground/60 group-hover:scale-110 transition-transform" />
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
							<Upload class="h-4 w-4 mr-1.5" />
							<span>{profileStore.profile.photoUrl ? 'Change Photo' : 'Upload Photo'}</span>
						</Button>

						{#if profileStore.profile.photoUrl}
							<Button variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" onclick={() => profileStore.setPhoto(null)}>
								<Trash2 class="h-4 w-4 mr-1" />
								<span>Remove</span>
							</Button>
						{/if}
					</div>
				</Card>
			</div>
		{:else if step === 4}
			<!-- Step 4: UI Theme & Dark Mode -->
			<div class="space-y-6 text-center animate-in fade-in duration-300">
				<div class="space-y-2">
					<h1 class="text-3xl font-extrabold text-foreground tracking-tight">Choose Your Style</h1>
					<p class="text-sm text-muted-foreground">You can switch styles anytime in Settings</p>
				</div>

				<div class="space-y-4 text-left">
					<!-- Theme selector cards -->
					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							class="p-4 rounded-3xl border text-left transition-all cursor-pointer {selectedTheme === 'modern'
								? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
								: 'border-border bg-card text-foreground hover:bg-accent'}"
							onclick={() => {
								selectedTheme = 'modern';
								profileStore.setUITheme('modern');
							}}
						>
							<div class="flex items-center justify-between font-bold text-sm">
								<span>Modern UI</span>
								{#if selectedTheme === 'modern'}
									<Check class="h-4 w-4 text-primary" />
								{/if}
							</div>
							<p class="text-[11px] text-muted-foreground mt-1">Cards, glowing avatar & progress metrics</p>
						</button>

						<button
							type="button"
							class="p-4 rounded-3xl border text-left transition-all cursor-pointer {selectedTheme === 'traditional'
								? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
								: 'border-border bg-card text-foreground hover:bg-accent'}"
							onclick={() => {
								selectedTheme = 'traditional';
								profileStore.setUITheme('traditional');
							}}
						>
							<div class="flex items-center justify-between font-bold text-sm">
								<span>Traditional</span>
								{#if selectedTheme === 'traditional'}
									<Check class="h-4 w-4 text-primary" />
								{/if}
							</div>
							<p class="text-[11px] text-muted-foreground mt-1">Classic "My Love" crimson top bar layout</p>
						</button>
					</div>

					<!-- Dark mode selector -->
					<div class="pt-2">
						<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Color Appearance</span>
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								class="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer text-foreground {selectedColorMode === 'system'
									? 'border-primary bg-primary/15 font-bold shadow-sm'
									: 'border-border bg-card hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'system';
									profileStore.setColorMode('system');
								}}
							>
								<Monitor class="h-4 w-4" />
								<span class="text-xs">System</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer text-foreground {selectedColorMode === 'light'
									? 'border-primary bg-primary/15 font-bold shadow-sm'
									: 'border-border bg-card hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'light';
									profileStore.setColorMode('light');
								}}
							>
								<Sun class="h-4 w-4" />
								<span class="text-xs">Light</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer text-foreground {selectedColorMode === 'dark'
									? 'border-primary bg-primary/15 font-bold shadow-sm'
									: 'border-border bg-card hover:bg-accent'}"
								onclick={() => {
									selectedColorMode = 'dark';
									profileStore.setColorMode('dark');
								}}
							>
								<Moon class="h-4 w-4" />
								<span class="text-xs">Dark</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		{:else if step === 5}
			<!-- Step 5: Install App (PWA) & Notifications -->
			<div class="space-y-6 text-center animate-in fade-in duration-300">
				<div class="h-20 w-20 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-lg shadow-rose-500/10">
					<Smartphone class="h-10 w-10 text-primary" />
				</div>

				<div class="space-y-2">
					<h1 class="text-3xl font-extrabold text-foreground tracking-tight">Install as an App</h1>
					<p class="text-sm text-muted-foreground">Add OpenLove to your home screen for quick access</p>
				</div>

				<!-- OS-Specific Installation Guide -->
				<Card class="p-5 bg-card border-border shadow-md text-left space-y-3">
					{#if userOS === 'ios'}
						<div class="flex items-start gap-3">
							<div class="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
								<Share2 class="h-5 w-5" />
							</div>
							<div class="text-xs space-y-1">
								<div class="font-bold text-foreground">For iPhone & iPad (Safari):</div>
								<p class="text-muted-foreground leading-relaxed">
									Tap the <strong class="text-foreground">Share</strong> icon at the bottom of Safari, then scroll down and tap <strong class="text-foreground">"Add to Home Screen"</strong>.
								</p>
							</div>
						</div>
					{:else if userOS === 'android'}
						<div class="flex items-start gap-3">
							<div class="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
								<Smartphone class="h-5 w-5" />
							</div>
							<div class="text-xs space-y-1">
								<div class="font-bold text-foreground">For Android (Chrome):</div>
								<p class="text-muted-foreground leading-relaxed">
									Tap the <strong class="text-foreground">three dots (⋮)</strong> in Chrome menu, then select <strong class="text-foreground">"Install app"</strong> or <strong class="text-foreground">"Add to Home screen"</strong>.
								</p>
							</div>
						</div>
					{:else}
						<div class="flex items-start gap-3">
							<div class="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
								<Monitor class="h-5 w-5" />
							</div>
							<div class="text-xs space-y-1">
								<div class="font-bold text-foreground">For Desktop:</div>
								<p class="text-muted-foreground leading-relaxed">
									Click the <strong class="text-foreground">Install App</strong> icon in your browser address bar to run OpenLove as a standalone window.
								</p>
							</div>
						</div>
					{/if}
				</Card>

				<!-- Push Notification Opt-in -->
				<Card class="p-4 bg-card border-border flex items-center justify-between gap-3 text-left">
					<div class="space-y-0.5">
						<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
							<BellRing class="h-4 w-4 text-primary" />
							<span>Anniversary Notifications</span>
						</div>
						<p class="text-[11px] text-muted-foreground">Receive reminders on your special milestones</p>
					</div>
					{#if pushOptedIn}
						<span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Enabled</span>
					{:else}
						<Button size="sm" variant="outline" class="text-xs shrink-0" onclick={handleOnboardingPushToggle} disabled={pushLoading}>
							<span>Enable</span>
						</Button>
					{/if}
				</Card>
			</div>
		{/if}
	</main>

	<!-- Bottom Action Button -->
	<footer class="pt-4">
		<Button class="w-full h-12 text-base font-semibold" size="lg" onclick={nextStep}>
			{#if step === totalSteps}
				<Sparkles class="h-5 w-5 mr-1.5" />
				<span>Finish Setup</span>
			{:else}
				<span>Continue</span>
				<ArrowRight class="h-5 w-5 ml-1.5" />
			{/if}
		</Button>
	</footer>
</div>

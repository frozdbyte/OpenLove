<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { UIThemeId, ColorMode, ColorPalette } from '$lib/types/profile';
	import type { Bond, BondType, DaysMilestoneFilter } from '$lib/types/bonds';
	import { calculateMilestones } from '$lib/utils/time';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input';
	import Switch from '$lib/components/ui/switch';
	import Badge from '$lib/components/ui/badge';
	import {
		Upload,
		Trash2,
		Trophy,
		Sparkles,
		RotateCcw,
		UploadCloud,
		PartyPopper,
		HeartHandshake,
		Plus,
		BellRing,
		QrCode,
		Heart,
		Code,
		CloudOff,
		ShieldCheck,
		HardDrive,
		Download,
		Users,
		Clock
	} from '@lucide/svelte';
	import { subscribeToPush, unsubscribeFromPush, sendTestPush, triggerSchedulerNow } from '$lib/push/client';
	import ScanImportModal from '$lib/components/share/ScanImportModal.svelte';
	import { APP_VERSION } from '$lib/version';
	import { networkStore } from '$lib/stores/network.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import { getStorageEstimate, type StorageEstimate } from '$lib/utils/storage';
	import BondTypeSelector from '$lib/components/shared/BondTypeSelector.svelte';
	import ThemeSelector from '$lib/components/shared/ThemeSelector.svelte';
	import ColorModeSelector from '$lib/components/shared/ColorModeSelector.svelte';
	import ColorPaletteSelector from '$lib/components/shared/ColorPaletteSelector.svelte';

	interface Props {
		open?: boolean;
		targetBondId?: string | null;
		isNewBond?: boolean;
		showAppWideSettings?: boolean;
		onOpenSwitcher?: () => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		targetBondId = null,
		isNewBond = false,
		showAppWideSettings = true,
		onOpenSwitcher,
		onclose
	}: Props = $props();

	let isScanModalOpen = $state(false);
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let backupInputRef = $state<HTMLInputElement | null>(null);

	// Target bond resolution
	let currentBond = $derived<Bond>(
		targetBondId
			? profileStore.state.bonds.find((b) => b.id === targetBondId) || profileStore.activeBond
			: profileStore.activeBond
	);

	// Form draft state (used for new bonds or live editing)
	let bondType = $state<BondType>('romantic');
	let bondNames = $state('');
	let bondTogetherSince = $state('');
	let bondPhotoBlob = $state<Blob | null>(null);
	let bondPhotoUrl = $state<string | undefined>(undefined);
	let bondNotificationsEnabled = $state(true);
	let bondYearsPref = $state(true);
	let bondMonthsPref = $state(true);
	let bondDaysPref = $state<DaysMilestoneFilter>('all');
	let bondCustomPref = $state(true);
	let bondUiTheme = $state<UIThemeId>('modern');
	let bondColorPalette = $state<ColorPalette>('rose');
	let bondColorMode = $state<ColorMode>('system');
	let bondShowSeconds = $state(false);

	let activeTheme = $derived<UIThemeId>(
		isNewBond ? bondUiTheme : (currentBond.uiTheme ?? profileStore.state.uiTheme)
	);
	let activeMode = $derived<ColorMode>(
		isNewBond ? bondColorMode : (currentBond.colorMode ?? profileStore.state.colorMode)
	);
	let activePalette = $derived<ColorPalette>(
		isNewBond ? bondColorPalette : (currentBond.colorPalette ?? profileStore.state.colorPalette)
	);
	let currentDays = $derived<DaysMilestoneFilter>(
		isNewBond
			? bondDaysPref
			: (currentBond.milestonePrefs?.days ?? (currentBond.type === 'friendship' ? 'major' : 'all'))
	);

	// Push state
	let isPushLoading = $state(false);
	let pushStatusMessage = $state('');


	// Sync local form state when opening or switching target bond
	$effect(() => {
		if (open) {
			if (isNewBond) {
				const active = profileStore.activeBond;
				bondType = 'romantic';
				bondNames = '';
				bondTogetherSince = new Date().toISOString().split('T')[0];
				bondPhotoBlob = null;
				bondPhotoUrl = undefined;
				bondNotificationsEnabled = true;
				bondYearsPref = true;
				bondMonthsPref = true;
				bondDaysPref = 'all';
				bondCustomPref = true;
				// Inherit UI settings from currently active bond
				bondUiTheme = active.uiTheme ?? profileStore.state.uiTheme;
				bondColorPalette = active.colorPalette ?? profileStore.state.colorPalette;
				bondColorMode = active.colorMode ?? profileStore.state.colorMode;
				bondShowSeconds = active.showSeconds ?? profileStore.state.showSeconds;
			} else {
				const b = currentBond;
				bondType = b.type || 'romantic';
				bondNames = b.names || '';
				bondTogetherSince = b.togetherSince || '';
				bondPhotoBlob = b.photoBlob ?? null;
				bondPhotoUrl = b.photoUrl;
				bondNotificationsEnabled = b.notificationsEnabled ?? true;
				bondYearsPref = b.milestonePrefs?.years ?? true;
				bondMonthsPref = b.milestonePrefs?.months ?? (b.type === 'friendship' ? false : true);
				bondDaysPref = b.milestonePrefs?.days ?? (b.type === 'friendship' ? 'major' : 'all');
				bondCustomPref = b.milestonePrefs?.custom ?? true;
				bondUiTheme = b.uiTheme ?? profileStore.state.uiTheme;
				bondColorPalette = b.colorPalette ?? profileStore.state.colorPalette;
				bondColorMode = b.colorMode ?? profileStore.state.colorMode;
				bondShowSeconds = b.showSeconds ?? profileStore.state.showSeconds;
			}
		}
	});

	// Storage durability
	let storage = $state<StorageEstimate | null>(null);

	$effect(() => {
		if (open && showAppWideSettings) {
			void getStorageEstimate().then((estimate) => (storage = estimate));
		}
	});

	// Milestone calculation for the current bond
	let bondMilestoneData = $derived(
		calculateMilestones(
			isNewBond ? bondTogetherSince : currentBond.togetherSince,
			isNewBond ? [] : currentBond.customMilestones,
			new Date(),
			isNewBond
				? { years: bondYearsPref, months: bondMonthsPref, days: bondDaysPref, custom: bondCustomPref }
				: currentBond.milestonePrefs
		)
	);

	// Milestone filter tab
	let selectedMilestoneTab = $state<'all' | 'months' | 'years' | 'days' | 'custom'>('all');

	let filteredMilestones = $derived(
		bondMilestoneData.milestones.filter((m) => {
			if (selectedMilestoneTab === 'all') return true;
			return m.type === selectedMilestoneTab;
		})
	);

	// Custom milestone form
	let newMilestoneTitle = $state('');
	let newMilestoneDate = $state('');
	let isAddingMilestone = $state(false);

	function handleTypeChange(newType: BondType) {
		bondType = newType;
		if (isNewBond) {
			if (newType === 'friendship') {
				bondMonthsPref = false;
				bondDaysPref = 'major';
			} else {
				bondMonthsPref = true;
				bondDaysPref = 'all';
			}
		} else {
			void profileStore.updateBond(currentBond.id, { type: newType });
		}
	}

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			bondPhotoBlob = file;
			if (bondPhotoUrl && bondPhotoUrl.startsWith('blob:')) {
				URL.revokeObjectURL(bondPhotoUrl);
			}
			bondPhotoUrl = URL.createObjectURL(file);

			if (!isNewBond) {
				await profileStore.setPhoto(file, currentBond.id);
			}
		}
	}

	async function removePhoto() {
		if (bondPhotoUrl && bondPhotoUrl.startsWith('blob:')) {
			URL.revokeObjectURL(bondPhotoUrl);
		}
		bondPhotoBlob = null;
		bondPhotoUrl = undefined;

		if (!isNewBond) {
			await profileStore.setPhoto(null, currentBond.id);
		}
	}

	async function handleLiveUpdate(patch: Partial<Bond>) {
		if (!isNewBond) {
			await profileStore.updateBond(currentBond.id, patch);
		}
	}

	async function handleCreateNewBond() {
		if (!bondNames.trim() || !bondTogetherSince) return;

		const newBond: Bond = {
			id: `bond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			type: bondType,
			names: bondNames.trim(),
			togetherSince: bondTogetherSince,
			photoBlob: null,
			photoUrl: undefined,
			customMilestones: [],
			notificationsEnabled: bondNotificationsEnabled,
			milestonePrefs: {
				years: bondYearsPref,
				months: bondMonthsPref,
				days: bondDaysPref,
				custom: bondCustomPref
			},
			uiTheme: bondUiTheme,
			colorPalette: bondColorPalette,
			colorMode: bondColorMode,
			showSeconds: bondShowSeconds
		};

		await profileStore.addBond(newBond);
		if (bondPhotoBlob) {
			await profileStore.setPhoto(bondPhotoBlob, newBond.id);
		}

		open = false;
		onclose?.();
	}

	async function handleDeleteCurrentBond() {
		if (confirm(`Are you sure you want to delete "${currentBond.names}"?`)) {
			await profileStore.deleteBond(currentBond.id);
			open = false;
			onclose?.();
		}
	}

	async function addCustomMilestone() {
		if (!newMilestoneTitle.trim() || !newMilestoneDate || isNewBond) return;

		const current = currentBond.customMilestones;
		const updated = [
			...current,
			{
				id: `custom_${Date.now()}`,
				title: newMilestoneTitle.trim(),
				date: newMilestoneDate
			}
		];
		await profileStore.updateBond(currentBond.id, { customMilestones: updated });
		newMilestoneTitle = '';
		newMilestoneDate = '';
		isAddingMilestone = false;
	}

	async function deleteCustomMilestone(id: string) {
		if (isNewBond) return;
		const current = currentBond.customMilestones;
		const updated = current.filter((m) => m.id !== id);
		await profileStore.updateBond(currentBond.id, { customMilestones: updated });
	}

	async function handlePushToggle(enable: boolean) {
		isPushLoading = true;
		pushStatusMessage = '';
		try {
			if (enable) {
				const res = await subscribeToPush();
				if (!res.success) {
					pushStatusMessage = res.error || 'Failed to enable notifications';
				} else if (res.pending) {
					pushStatusMessage =
						res.error || "Saved — notifications will activate when you're back online.";
				} else {
					pushStatusMessage = 'Push notifications enabled!';
				}
			} else {
				await unsubscribeFromPush();
				pushStatusMessage = 'Push notifications disabled';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error updating push notifications';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTestPush() {
		isPushLoading = true;
		pushStatusMessage = 'Sending test notification...';
		try {
			const res = await sendTestPush();
			if (res.success) {
				pushStatusMessage = 'Test notification sent!';
			} else {
				pushStatusMessage = res.error || 'Failed to send test push';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error sending test push';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTestMilestonePush() {
		isPushLoading = true;
		pushStatusMessage = 'Sending test milestone notification...';
		try {
			const res = await sendTestPush({
				bondId: currentBond.id,
				milestoneTitle: currentBond.type === 'friendship' ? '1st Year' : '1st Anniversary',
				milestoneType: 'years'
			});
			if (res.success) {
				pushStatusMessage = `Milestone alert sent for ${currentBond.names}!`;
			} else {
				pushStatusMessage = res.error || 'Failed to send test milestone push';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error sending test push';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTriggerScheduler() {
		isPushLoading = true;
		pushStatusMessage = 'Checking milestones on server...';
		try {
			const res = await triggerSchedulerNow();
			if (res.success) {
				pushStatusMessage = `Scheduler ran! Sent ${res.sent ?? 0} notification(s).`;
			} else {
				pushStatusMessage = res.error || 'Failed to run scheduler';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error running scheduler';
		} finally {
			isPushLoading = false;
		}
	}

	function downloadBackup() {
		const blob = new Blob([profileStore.exportJSON()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `openlove-backup-${new Date().toISOString().split('T')[0]}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function handleBackupImport(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			const text = await file.text();
			const ok = await profileStore.importJSON(text);
			if (ok) {
				alert('Data restored successfully!');
			} else {
				alert('Failed to restore backup. Invalid file format.');
			}
		}
	}

	async function handleResetData() {
		if (confirm('Are you sure you want to reset all data? This will clear all relationships.')) {
			await profileStore.reset();
			open = false;
			onclose?.();
		}
	}

</script>

<Modal
	bind:open
	title={isNewBond
		? 'Add Relationship or Friendship'
		: showAppWideSettings
			? 'Settings & Customization'
			: `Edit ${currentBond.type === 'friendship' ? 'Friendship' : 'Relationship'}`}
	description={isNewBond
		? 'Track another romantic relationship or friendship'
		: showAppWideSettings
			? 'Customize your relationship tracker'
			: `Configure names, dates, themes, and notifications`}
	{onclose}
>
	<div class="space-y-6 pb-4">
		<!-- Active Bond Switcher Quick Action (Header gear mode only when multiple bonds exist) -->
		{#if showAppWideSettings && !isNewBond && profileStore.state.bonds.length > 1}
			<section class="p-3.5 rounded-2xl bg-card border border-border space-y-2">

				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
							<Users class="h-4 w-4 text-primary" />
							<span>Active Bond</span>
						</div>
						<div class="text-xs text-muted-foreground">
							Currently: <span class="font-medium text-foreground">{currentBond.names}</span>
							({currentBond.type === 'friendship' ? '🌿 Friendship' : '💖 Relationship'})
						</div>
					</div>
				</div>
				{#if onOpenSwitcher}
					<Button variant="outline" size="sm" class="w-full mt-1.5" onclick={onOpenSwitcher}>
						<span>Manage & Switch Bonds ({profileStore.state.bonds.length})</span>
					</Button>
				{/if}
			</section>
		{/if}

		{#if isNewBond}
			<!-- Import Shared Profile Action -->
			<section class="p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
				<div class="space-y-0.5 min-w-0">
					<div class="text-xs font-bold text-foreground flex items-center gap-1.5">
						<QrCode class="h-4 w-4 text-primary shrink-0" />
						<span>Have a partner invite or QR code?</span>
					</div>
					<p class="text-[11px] text-muted-foreground truncate">Import partner or friend profile directly</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					class="shrink-0 text-xs h-8 px-2.5 font-semibold bg-background"
					onclick={() => (isScanModalOpen = true)}
				>
					<span>Scan / Paste</span>
				</Button>
			</section>
		{/if}

		<!-- Bond Type Selector -->
		<section>
			<BondTypeSelector value={bondType} onchange={handleTypeChange} />
		</section>

		<!-- Names & Start Date of this Bond -->
		<section class="space-y-3">
			<div>
				<label for="settings-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
					{bondType === 'friendship' ? 'Friend Names' : 'Partner Names'}
				</label>
				<Input
					id="settings-names"
					value={isNewBond ? bondNames : currentBond.names}
					placeholder={bondType === 'friendship' ? 'e.g. Alex & Sam' : 'e.g. Emma & Paul'}
					oninput={(e) => {
						const val = (e.target as HTMLInputElement).value;
						bondNames = val;
						if (!isNewBond) handleLiveUpdate({ names: val });
					}}
				/>
			</div>

			<div>
				<label for="settings-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
					{bondType === 'friendship' ? 'Friends Since Date' : 'Together Since Date'}
				</label>
				<Input
					id="settings-date"
					type="date"
					value={isNewBond ? bondTogetherSince : currentBond.togetherSince}
					onchange={(e) => {
						const val = (e.target as HTMLInputElement).value;
						bondTogetherSince = val;
						if (!isNewBond) handleLiveUpdate({ togetherSince: val });
					}}
				/>
			</div>
		</section>

		<!-- Photo for this Bond -->
		<section class="space-y-3">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
				{bondType === 'friendship' ? 'Friend Photo' : 'Couple Photo'}
			</span>
			<div class="flex items-center gap-4">
				<div class="h-16 w-16 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
					{#if (isNewBond ? bondPhotoUrl : currentBond.photoUrl)}
						<img src={isNewBond ? bondPhotoUrl : currentBond.photoUrl} alt="Bond" class="h-full w-full object-cover" />
					{:else if bondType === 'friendship'}
						<Sparkles class="h-6 w-6 text-muted-foreground" />
					{:else}
						<Upload class="h-6 w-6 text-muted-foreground" />
					{/if}
				</div>

				<div class="flex flex-col gap-2 flex-1">
					<input
						type="file"
						accept="image/*"
						class="hidden"
						bind:this={fileInputRef}
						onchange={handlePhotoUpload}
					/>
					<Button size="sm" variant="outline" onclick={() => fileInputRef?.click()}>
						<Upload class="h-4 w-4 mr-1.5" />
						<span>{(isNewBond ? bondPhotoUrl : currentBond.photoUrl) ? 'Change Photo' : 'Upload Photo'}</span>
					</Button>

					{#if (isNewBond ? bondPhotoUrl : currentBond.photoUrl)}
						<Button size="sm" variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={removePhoto}>
							<Trash2 class="h-4 w-4 mr-1.5" />
							<span>Remove Photo</span>
						</Button>
					{/if}
				</div>
			</div>
		</section>

		<!-- UI Style Theme (Configured Per-Bond) -->
		<section>
			<ThemeSelector
				value={activeTheme}
				onchange={(theme) => {
					bondUiTheme = theme;
					if (!isNewBond) void profileStore.setUITheme(theme, currentBond.id);
				}}
			/>
		</section>

		<!-- Color Appearance & Accent Palette (Configured Per-Bond) -->
		<section class="space-y-3">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Color Appearance</span>
			<ColorModeSelector
				value={activeMode}
				onchange={(mode) => {
					bondColorMode = mode;
					if (!isNewBond) void profileStore.setColorMode(mode, currentBond.id);
				}}
			/>

			<!-- Accent Palette -->
			<ColorPaletteSelector
				value={activePalette}
				onchange={(palette) => {
					bondColorPalette = palette;
					if (!isNewBond) void profileStore.setColorPalette(palette, currentBond.id);
				}}
			/>
		</section>


		<!-- Ticking Seconds Toggle (Per-Bond) -->
		<section class="flex items-center justify-between p-3 rounded-2xl bg-card border border-border">
			<div>
				<div class="text-sm font-semibold text-foreground flex items-center gap-1.5">
					<Clock class="h-4 w-4 text-primary" />
					<span>Live Ticking Seconds</span>
				</div>
				<div class="text-xs text-muted-foreground">Show live seconds counter for this bond</div>
			</div>
			<Switch
				checked={isNewBond ? bondShowSeconds : (currentBond.showSeconds ?? profileStore.state.showSeconds)}
				onchange={(val) => {
					bondShowSeconds = val;
					if (!isNewBond) handleLiveUpdate({ showSeconds: val });
				}}
			/>
		</section>

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
				<Switch
					checked={isNewBond ? bondNotificationsEnabled : (currentBond.notificationsEnabled ?? true)}
					onchange={(v) => {
						bondNotificationsEnabled = v;
						if (!isNewBond) handleLiveUpdate({ notificationsEnabled: v });
					}}
				/>
			</div>

			{#if (isNewBond ? bondNotificationsEnabled : (currentBond.notificationsEnabled ?? true))}
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
						<Switch
							checked={isNewBond ? bondYearsPref : (currentBond.milestonePrefs?.years ?? true)}
							onchange={(v) => {
								bondYearsPref = v;
								if (!isNewBond) {
									handleLiveUpdate({
										milestonePrefs: {
											...(currentBond.milestonePrefs || {}),
											years: v,
											months: currentBond.milestonePrefs?.months ?? true,
											days: currentBond.milestonePrefs?.days ?? 'all',
											custom: currentBond.milestonePrefs?.custom ?? true
										}
									});
								}
							}}
						/>
					</div>

					<!-- Month Milestones -->
					<div class="flex items-center justify-between text-xs text-foreground">
						<div class="flex items-center gap-2">
							<Sparkles class="h-3.5 w-3.5 text-rose-500" />
							<span>Monthly Milestones (1st–11th mo, 18mo...)</span>
						</div>
						<Switch
							checked={isNewBond ? bondMonthsPref : (currentBond.milestonePrefs?.months ?? (currentBond.type === 'friendship' ? false : true))}
							onchange={(v) => {
								bondMonthsPref = v;
								if (!isNewBond) {
									handleLiveUpdate({
										milestonePrefs: {
											...(currentBond.milestonePrefs || {}),
											years: currentBond.milestonePrefs?.years ?? true,
											months: v,
											days: currentBond.milestonePrefs?.days ?? 'all',
											custom: currentBond.milestonePrefs?.custom ?? true
										}
									});
								}
							}}
						/>
					</div>

					<!-- Day Milestones -->
					<div class="space-y-2 pt-1.5">
						<div class="flex items-center justify-between text-xs">
							<div class="flex items-center gap-2 font-semibold text-foreground">
								<Trophy class="h-4 w-4 text-amber-500 shrink-0" />
								<span>Day Milestones</span>
							</div>
							<span class="text-[11px] text-muted-foreground font-medium">
								{#if currentDays === 'all'}
									Every 50–100 days
								{:else if currentDays === 'major'}
									1,000+ days only
								{:else}
									Disabled
								{/if}
							</span>
						</div>

						<div class="grid grid-cols-3 gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border/60">
							<button
								type="button"
								class="flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all cursor-pointer {currentDays === 'all'
									? 'bg-card text-foreground font-bold shadow-xs ring-1 ring-border/50 text-primary'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => {
									bondDaysPref = 'all';
									if (!isNewBond) {
										handleLiveUpdate({
											milestonePrefs: {
												...(currentBond.milestonePrefs || {}),
												years: currentBond.milestonePrefs?.years ?? true,
												months: currentBond.milestonePrefs?.months ?? true,
												days: 'all',
												custom: currentBond.milestonePrefs?.custom ?? true
											}
										});
									}
								}}
							>
								<span class="text-xs font-semibold">All Days</span>
								<span class="text-[10px] opacity-70 font-normal mt-0.5">50, 100, 200...</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all cursor-pointer {currentDays === 'major'
									? 'bg-card text-foreground font-bold shadow-xs ring-1 ring-border/50 text-primary'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => {
									bondDaysPref = 'major';
									if (!isNewBond) {
										handleLiveUpdate({
											milestonePrefs: {
												...(currentBond.milestonePrefs || {}),
												years: currentBond.milestonePrefs?.years ?? true,
												months: currentBond.milestonePrefs?.months ?? true,
												days: 'major',
												custom: currentBond.milestonePrefs?.custom ?? true
											}
										});
									}
								}}
								title="Only 1,000+ days (1000, 2500, 5000...)"
							>
								<span class="text-xs font-semibold">Major Only</span>
								<span class="text-[10px] opacity-70 font-normal mt-0.5">1k, 2.5k, 5k...</span>
							</button>

							<button
								type="button"
								class="flex flex-col items-center justify-center py-2 px-1.5 rounded-xl transition-all cursor-pointer {currentDays === 'off'
									? 'bg-card text-foreground font-bold shadow-xs ring-1 ring-border/50 text-primary'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => {
									bondDaysPref = 'off';
									if (!isNewBond) {
										handleLiveUpdate({
											milestonePrefs: {
												...(currentBond.milestonePrefs || {}),
												years: currentBond.milestonePrefs?.years ?? true,
												months: currentBond.milestonePrefs?.months ?? true,
												days: 'off',
												custom: currentBond.milestonePrefs?.custom ?? true
											}
										});
									}
								}}
							>
								<span class="text-xs font-semibold">Off</span>
								<span class="text-[10px] opacity-70 font-normal mt-0.5">No alerts</span>
							</button>
						</div>
					</div>


					<!-- Custom Moments -->
					<div class="flex items-center justify-between text-xs text-foreground">
						<div class="flex items-center gap-2">
							<HeartHandshake class="h-3.5 w-3.5 text-primary" />
							<span>Custom Moments</span>
						</div>
						<Switch
							checked={isNewBond ? bondCustomPref : (currentBond.milestonePrefs?.custom ?? true)}
							onchange={(v) => {
								bondCustomPref = v;
								if (!isNewBond) {
									handleLiveUpdate({
										milestonePrefs: {
											...(currentBond.milestonePrefs || {}),
											years: currentBond.milestonePrefs?.years ?? true,
											months: currentBond.milestonePrefs?.months ?? true,
											days: currentBond.milestonePrefs?.days ?? 'all',
											custom: v
										}
									});
								}
							}}
						/>
					</div>
				</div>
			{/if}
		</section>

		<!-- Milestones List & Custom Milestones (Per-Bond) -->
		{#if !isNewBond}
			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Milestones for {currentBond.names}</span>
					<Button size="sm" variant="ghost" onclick={() => (isAddingMilestone = !isAddingMilestone)}>
						<Plus class="h-4 w-4 mr-1" />
						<span>Add Custom</span>
					</Button>
				</div>

				{#if isAddingMilestone}
					<div class="p-3 rounded-2xl bg-card border border-border space-y-2">
						<Input placeholder="Milestone Name (e.g. First Date, Moved In)" bind:value={newMilestoneTitle} />
						<Input type="date" bind:value={newMilestoneDate} />
						<div class="flex gap-2">
							<Button size="sm" class="flex-1" onclick={addCustomMilestone}>Save</Button>
							<Button size="sm" variant="outline" onclick={() => (isAddingMilestone = false)}>Cancel</Button>
						</div>
					</div>
				{/if}

				<!-- Filter tabs -->
				<div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
					{#each [
						{ id: 'all' as const, label: 'All' },
						{ id: 'months' as const, label: 'Months' },
						{ id: 'years' as const, label: 'Years' },
						{ id: 'days' as const, label: 'Days' },
						{ id: 'custom' as const, label: 'Custom' }
					] as tab}
						<button
							type="button"
							class="px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer {selectedMilestoneTab === tab.id
								? 'bg-primary text-white shadow-sm'
								: 'bg-card text-muted-foreground hover:text-foreground border border-border'}"
							onclick={() => (selectedMilestoneTab = tab.id)}
						>
							{tab.label}
						</button>
					{/each}
				</div>

				<div class="space-y-2 max-h-52 overflow-y-auto pr-1">
					{#each filteredMilestones as m}
						<div class="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 text-xs text-foreground">
							<div class="flex items-center gap-2">
								{#if m.type === 'years'}
									<PartyPopper class="h-4 w-4 text-amber-500 shrink-0" />
								{:else if m.type === 'months'}
									<Sparkles class="h-4 w-4 text-rose-500 shrink-0" />
								{:else if m.type === 'custom'}
									<HeartHandshake class="h-4 w-4 text-primary shrink-0" />
								{:else}
									<Trophy class="h-4 w-4 text-amber-600 shrink-0" />
								{/if}
								<span class="font-medium {m.isAchieved ? 'line-through text-muted-foreground' : 'text-foreground'}">{m.title}</span>
							</div>
							<div class="flex items-center gap-1.5">
								<Badge variant={m.isAchieved ? 'secondary' : 'romantic'} class="text-[10px]">
									{m.isAchieved ? 'Achieved' : `in ${m.daysRemaining} days`}
								</Badge>
								{#if m.type === 'custom'}
									<button
										type="button"
										class="text-muted-foreground hover:text-destructive p-1 rounded transition-colors cursor-pointer"
										onclick={() => deleteCustomMilestone(m.sourceId!)}
										title="Delete"
										aria-label="Delete milestone"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Create New Bond Action -->
		{#if isNewBond}
			<div class="pt-2">
				<Button class="w-full h-11" onclick={handleCreateNewBond} disabled={!bondNames.trim() || !bondTogetherSince}>
					<Plus class="h-4 w-4 mr-2" />
					<span>Create Bond</span>
				</Button>
			</div>
		{/if}

		<!-- Delete Bond Button (Scoped edit mode when multiple bonds exist) -->
		{#if !isNewBond && !showAppWideSettings && profileStore.state.bonds.length > 1}
			<div class="pt-2 border-t border-border">
				<Button variant="outline" class="w-full text-destructive hover:bg-destructive/10" onclick={handleDeleteCurrentBond}>
					<Trash2 class="h-4 w-4 mr-1.5" />
					<span>Delete Bond</span>
				</Button>
			</div>
		{/if}

		<!-- App-Wide System Settings (Header gear mode only) -->
		{#if showAppWideSettings && !isNewBond}
			<!-- Push Notifications Master Connection -->
			<section class="p-3.5 rounded-2xl bg-card border border-border space-y-3">
				<div class="flex items-center justify-between">
					<div class="space-y-0.5">
						<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
							<BellRing class="h-4 w-4 text-primary" />
							<span>Device Notifications</span>
						</div>
						<div class="text-xs text-muted-foreground">Receive background WebPush alerts on this device</div>
					</div>
					<Switch
						checked={profileStore.state.pushSubscribed}
						disabled={isPushLoading}
						onchange={handlePushToggle}
					/>
				</div>

				{#if profileStore.state.pushSubscribed}
					<div class="pt-2 border-t border-border/50 space-y-2">
						<div class="flex items-center justify-between gap-2">
							<span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Device Connected</span>
							<Button
								size="sm"
								variant="outline"
								class="h-7 text-xs px-2.5"
								onclick={handleTestPush}
								disabled={isPushLoading || !networkStore.isOnline}
							>
								<span>{networkStore.isOnline ? 'Test Alert' : 'Offline'}</span>
							</Button>
						</div>

						<div class="flex items-center gap-1.5 pt-1">
							<Button
								size="sm"
								variant="outline"
								class="flex-1 h-7 text-[11px] px-2"
								onclick={handleTestMilestonePush}
								disabled={isPushLoading || !networkStore.isOnline}
								title="Sends a test milestone alert formatted specifically for your active relationship/friendship"
							>
								<span>Test Milestone Alert</span>
							</Button>
							<Button
								size="sm"
								variant="outline"
								class="flex-1 h-7 text-[11px] px-2"
								onclick={handleTriggerScheduler}
								disabled={isPushLoading || !networkStore.isOnline}
								title="Triggers the server's milestone evaluation logic on all registered bonds right now"
							>
								<span>Run Cron Check</span>
							</Button>
						</div>
					</div>
				{:else if profileStore.state.pushIntent}
					<div class="pt-2 border-t border-border/50 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
						<CloudOff class="h-3.5 w-3.5 shrink-0" />
						<span>Waiting for a connection to activate on this device</span>
					</div>
				{/if}

				{#if pushStatusMessage}
					<p class="text-xs text-muted-foreground italic">{pushStatusMessage}</p>
				{/if}
			</section>

			<!-- On-device storage durability -->
			<section class="p-3.5 rounded-2xl bg-card border border-border space-y-2.5">
				<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
					<HardDrive class="h-4 w-4 text-primary" />
					<span>Data on This Device</span>
				</div>
				<p class="text-xs text-muted-foreground">
					Your names, dates and photos never leave this device. That also means this is the
					only copy — keep a backup.
				</p>

				{#if storage}
					<div class="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
						<span>{storage.usageLabel} used</span>
						<span>{storage.quotaLabel} available</span>
					</div>
				{/if}

				{#if pwaStore.isStoragePersisted}
					<div class="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
						<ShieldCheck class="h-3.5 w-3.5 shrink-0" />
						<span>Protected from automatic cleanup</span>
					</div>
				{:else}
					<div class="space-y-2">
						<div class="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
							<CloudOff class="h-3.5 w-3.5 shrink-0 mt-0.5" />
							<span>
								{pwaStore.isStandalone
									? 'Storage is not marked as persistent yet.'
									: 'In a browser tab, iOS can clear this data after ~7 days unused. Install Open Love to your Home Screen to keep it safe.'}
							</span>
						</div>
						<Button
							size="sm"
							variant="outline"
							class="w-full h-8 text-xs"
							onclick={() => pwaStore.ensurePersistentStorage()}
						>
							<ShieldCheck class="h-3.5 w-3.5 mr-1.5" />
							<span>Request Persistent Storage</span>
						</Button>
					</div>
				{/if}

				<Button variant="outline" class="w-full" onclick={downloadBackup}>
					<Download class="h-4 w-4 mr-1.5" />
					<span>Download JSON Backup (All Bonds)</span>
				</Button>
			</section>

			<!-- Backup & Reset -->
			<section class="pt-2 border-t border-border space-y-2">
				<Button variant="outline" class="w-full" onclick={() => (isScanModalOpen = true)}>
					<QrCode class="h-4 w-4 mr-1.5" />
					<span>Sync with Partner / Scan QR</span>
				</Button>

				<input
					type="file"
					accept=".json"
					class="hidden"
					bind:this={backupInputRef}
					onchange={handleBackupImport}
				/>
				<Button variant="outline" class="w-full" onclick={() => backupInputRef?.click()}>
					<UploadCloud class="h-4 w-4 mr-1.5" />
					<span>Restore from JSON Backup</span>
				</Button>

				<Button variant="ghost" class="w-full text-destructive hover:bg-destructive/10" onclick={handleResetData}>
					<RotateCcw class="h-4 w-4 mr-1.5" />
					<span>Reset All Data</span>
				</Button>
			</section>

			<!-- App Version Indicator -->
			<div class="pt-2 pb-1 text-center space-y-1">
				<div class="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/50 text-[11px] font-medium text-muted-foreground">
					<Heart class="h-3 w-3 text-primary fill-primary/30" />
					<span>Open Love v{APP_VERSION}</span>
				</div>
				<p class="text-[10px] text-muted-foreground/60">Privacy-first & self-hosted
				<br>Made with 🩵 by Frozd</p>
				<a class="text-[10px] text-muted-foreground/40" href="https://github.com/frozdbyte/openlove">
					<Code class="inline size-2.5 mr-0.5" />
					View Source on GitHub
				</a>
			</div>
		{/if}
	</div>
</Modal>

<ScanImportModal
	bind:open={isScanModalOpen}
	onSuccess={() => {
		if (isNewBond) {
			open = false;
			onclose?.();
		}
	}}
/>


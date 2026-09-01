<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { pwaStore } from '$lib/stores/pwa.svelte';
	import type { UIThemeId, ColorMode, ColorPalette } from '$lib/types/profile';
	import type { Bond, BondType, DaysMilestoneFilter } from '$lib/types/bonds';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import ConfirmModal from '$lib/components/ui/dialog/ConfirmModal.svelte';
	import Button from '$lib/components/ui/button';
	import Switch from '$lib/components/ui/switch';
	import Badge from '$lib/components/ui/badge';
	import {
		Trash2,
		Plus,
		QrCode,
		Users,
		Clock,
		BellOff,
		UserRound,
		Palette,
		Bell,
		BellRing,
		Flag,
		Database,
		Info,
		ChevronRight,
		PartyPopper,
		Sparkles,
		Heart
	} from '@lucide/svelte';
	import ScanImportModal from '$lib/components/share/ScanImportModal.svelte';
	import ThemeSelector from '$lib/components/shared/ThemeSelector.svelte';
	import ColorModeSelector from '$lib/components/shared/ColorModeSelector.svelte';
	import ColorPaletteSelector from '$lib/components/shared/ColorPaletteSelector.svelte';
	import BondIdentityForm from './BondIdentityForm.svelte';
	import MilestonePrefsEditor from './MilestonePrefsEditor.svelte';
	import MilestonesList from './MilestonesList.svelte';
	import PushNotificationPanel from './PushNotificationPanel.svelte';
	import StorageBackupPanel from './StorageBackupPanel.svelte';
	import AboutPanel from './AboutPanel.svelte';

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
	let isDeleteConfirmOpen = $state(false);
	let photoUploadError = $state('');
	let isPhotoSaving = $state(false);
	let wizardStep = $state<1 | 2 | 3>(1);

	// Root-list/sub-view navigation within the drawer
	type SettingsSection =
		| 'identity'
		| 'appearance'
		| 'milestones'
		| 'alerts'
		| 'deviceNotifications'
		| 'data'
		| 'about';
	let activeSection = $state<SettingsSection | null>(null);

	const SECTION_META: Record<
		SettingsSection,
		{ title: string; description: string; icon: typeof UserRound; needsAttention?: () => boolean }
	> = {
		identity: { title: 'Identity', description: 'Names, date, and photo', icon: UserRound },
		appearance: { title: 'Appearance', description: 'Theme, colors, and display', icon: Palette },
		milestones: { title: 'Milestones', description: 'Upcoming moments, custom dates & celebrations', icon: Flag },
		alerts: { title: 'Alerts', description: 'Push alerts and which milestones trigger them', icon: Bell },
		deviceNotifications: {
			title: 'Device Notifications',
			description: 'WebPush subscription for this device',
			icon: BellRing
		},
		data: {
			title: 'Storage & Backup',
			description: 'Backup, restore, and reset',
			icon: Database,
			needsAttention: () => !pwaStore.isStoragePersisted
		},
		about: { title: 'About', description: "Version, what's new, and links", icon: Info }
	};

	const BOND_SECTIONS: SettingsSection[] = ['identity', 'appearance', 'milestones', 'alerts'];
	const APP_SECTIONS: SettingsSection[] = ['deviceNotifications', 'data', 'about'];

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
	let bondAutoCelebrate = $state(true);

	let activeTheme = $derived<UIThemeId>(
		isNewBond ? bondUiTheme : (currentBond.uiTheme ?? profileStore.state.uiTheme)
	);
	let activeMode = $derived<ColorMode>(
		isNewBond ? bondColorMode : (currentBond.colorMode ?? profileStore.state.colorMode)
	);
	let activePalette = $derived<ColorPalette>(
		isNewBond ? bondColorPalette : (currentBond.colorPalette ?? profileStore.state.colorPalette)
	);

	// Reset navigation and wizard state when drawer opens
	$effect(() => {
		if (open) {
			activeSection = null;
			wizardStep = 1;
			photoUploadError = '';
		}
	});

	// Sync local form state when opening or switching target bond
	$effect(() => {
		if (open) {
			if (isNewBond) {
				const active = profileStore.activeBond;
				bondType = 'romantic';
				bondNames = '';
				const now = new Date();
				bondTogetherSince = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
				bondAutoCelebrate = active.autoCelebrateMilestones ?? true;
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
				bondAutoCelebrate = b.autoCelebrateMilestones ?? true;
			}
		}
	});

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
			photoUploadError = '';

			// 10 MB client-side limit
			if (file.size > 10 * 1024 * 1024) {
				photoUploadError = 'Photo is too large (max 10 MB). Please choose a smaller image.';
				return;
			}

			bondPhotoBlob = file;
			if (bondPhotoUrl && bondPhotoUrl.startsWith('blob:')) {
				URL.revokeObjectURL(bondPhotoUrl);
			}
			bondPhotoUrl = URL.createObjectURL(file);

			if (!isNewBond) {
				isPhotoSaving = true;
				try {
					await profileStore.setPhoto(file, currentBond.id);
				} finally {
					isPhotoSaving = false;
				}
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

		const photoToSave = bondPhotoBlob;

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
			showSeconds: bondShowSeconds,
			autoCelebrateMilestones: bondAutoCelebrate
		};

		await profileStore.addBond(newBond);
		if (photoToSave) {
			await profileStore.setPhoto(photoToSave, newBond.id);
		}

		open = false;
		onclose?.();
	}

	async function handleDeleteCurrentBond() {
		await profileStore.deleteBond(currentBond.id);
		open = false;
		onclose?.();
	}
</script>

<Modal
	bind:open
	title={activeSection
		? SECTION_META[activeSection].title
		: isNewBond
			? wizardStep === 1
				? 'New Bond — Identity'
				: wizardStep === 2
					? 'New Bond — Appearance'
					: 'New Bond — Ready!'
			: showAppWideSettings
				? `${currentBond.names} Settings`
				: `Edit ${currentBond.type === 'friendship' ? 'Friendship' : 'Relationship'}`}
	description={activeSection
		? SECTION_META[activeSection].description
		: isNewBond
			? wizardStep === 1
				? 'Who is this bond with?'
				: wizardStep === 2
					? 'How should it look?'
					: 'Review and create'
			: showAppWideSettings
				? 'Customize appearance, alerts & more'
				: 'Configure names, dates, themes, and notifications'}
	onBack={activeSection
		? () => (activeSection = null)
		: isNewBond
			? wizardStep === 2
				? () => (wizardStep = 1)
				: wizardStep === 3
					? () => (wizardStep = 2)
					: undefined
			: undefined}
	{onclose}
>
	<div class="space-y-6 pb-4">
		{#if isNewBond}
			<!-- Step Indicator -->
			<div class="flex items-center justify-between text-xs text-muted-foreground pb-1 -mt-2">
				<span>Step {wizardStep} of 3</span>
			</div>

			{#if wizardStep === 1}
				<!-- Step 1: Identity -->
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

				<BondIdentityForm
					{isNewBond}
					{currentBond}
					{bondType}
					{bondNames}
					{bondTogetherSince}
					{bondPhotoUrl}
					{photoUploadError}
					{isPhotoSaving}
					onTypeChange={handleTypeChange}
					onNamesChange={(val) => {
						bondNames = val;
					}}
					onDateChange={(val) => {
						bondTogetherSince = val;
					}}
					onPhotoUpload={handlePhotoUpload}
					onPhotoRemove={removePhoto}
				/>

				<div class="pt-2">
					<Button
						class="w-full h-11 font-semibold"
						onclick={() => (wizardStep = 2)}
						disabled={!bondNames.trim() || !bondTogetherSince}
					>
						<span>Next: Appearance →</span>
					</Button>
				</div>
			{:else if wizardStep === 2}
				<!-- Step 2: Appearance -->
				<section>
					<ThemeSelector
						value={bondUiTheme}
						allowExpand={true}
						onchange={(theme) => (bondUiTheme = theme)}
					/>
				</section>

				<section class="space-y-3">
					<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Color Appearance</span>
					<ColorModeSelector
						value={bondColorMode}
						onchange={(mode) => (bondColorMode = mode)}
					/>

					<ColorPaletteSelector
						value={bondColorPalette}
						onchange={(palette) => (bondColorPalette = palette)}
					/>
				</section>

				<section class="flex items-center justify-between p-3 rounded-2xl bg-card border border-border">
					<div>
						<div class="text-sm font-semibold text-foreground flex items-center gap-1.5">
							<Clock class="h-4 w-4 text-primary" />
							<span>Live Ticking Seconds</span>
						</div>
						<div class="text-xs text-muted-foreground">Show live seconds counter for this bond</div>
					</div>
					<Switch
						checked={bondShowSeconds}
						onchange={(val) => (bondShowSeconds = val)}
					/>
				</section>

				<div class="space-y-2 pt-2">
					<Button class="w-full h-11 font-semibold" onclick={() => (wizardStep = 3)}>
						<span>Next: Review & Finish →</span>
					</Button>
				</div>
			{:else if wizardStep === 3}
				<!-- Step 3: Review & Create -->
				<section class="p-4 rounded-2xl bg-card border border-border space-y-3">
					<div class="flex items-center gap-3">
						<div class="h-12 w-12 rounded-full overflow-hidden bg-muted border border-border/80 flex items-center justify-center shrink-0">
							{#if bondPhotoUrl}
								<img src={bondPhotoUrl} alt="Bond" class="h-full w-full object-cover" />
							{:else if bondType === 'friendship'}
								<Sparkles class="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
							{:else}
								<Heart class="h-6 w-6 text-rose-500 fill-rose-500/20" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<h3 class="font-bold text-base text-foreground truncate">{bondNames}</h3>
								<Badge
									variant={bondType === 'friendship' ? 'outline' : 'romantic'}
									class="text-[10px] py-0 px-1.5 shrink-0"
								>
									{bondType === 'friendship' ? '🌿 Friend' : '💖 Couple'}
								</Badge>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">
								{bondType === 'friendship' ? 'Friends since' : 'Together since'} {bondTogetherSince}
							</p>
						</div>
					</div>
				</section>

				<!-- Celebration Cards Per-Bond Toggle -->
				<section class="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border">
					<div class="space-y-0.5 pr-2">
						<div class="text-sm font-semibold text-foreground flex items-center gap-1.5">
							<PartyPopper class="h-4 w-4 text-primary shrink-0" />
							<span>Celebration Cards</span>
						</div>
						<div class="text-xs text-muted-foreground">
							Auto-show full-screen celebration on milestone days for this bond
						</div>
					</div>
					<Switch
						checked={bondAutoCelebrate}
						onchange={(val) => (bondAutoCelebrate = val)}
					/>
				</section>

				<div class="space-y-2 pt-2">
					<Button
						class="w-full h-11 font-semibold"
						onclick={handleCreateNewBond}
						disabled={!bondNames.trim() || !bondTogetherSince}
					>
						<Plus class="h-4 w-4 mr-1.5" />
						<span>Create Bond</span>
					</Button>
					<Button variant="ghost" class="w-full h-9 text-xs" onclick={() => (wizardStep = 2)}>
						<span>← Back to Appearance</span>
					</Button>
				</div>
			{/if}
		{:else if activeSection === null}
			<!-- Existing Bond Navigation (Active Bond Header gear mode or scoped edit) -->

			<!-- Active Bond Switcher Quick Action -->
			{#if showAppWideSettings && profileStore.state.bonds.length > 1}
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
						<Button variant="outline" size="sm" class="w-full mt-1.5 font-semibold" onclick={onOpenSwitcher}>
							<span>Manage & Switch Bonds ({profileStore.state.bonds.length})</span>
						</Button>
					{/if}
				</section>
			{/if}

			<!-- Bond navigation sections -->
			<nav class="space-y-2">
				{#each BOND_SECTIONS as key (key)}
					{@const meta = SECTION_META[key]}
					{@const Icon = meta.icon}
					{@const attention = meta.needsAttention?.() ?? false}
					<button
						type="button"
						class="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-card/70 hover:bg-accent/60 transition-colors text-left cursor-pointer"
						onclick={() => (activeSection = key)}
					>
						<div class="relative h-9 w-9 shrink-0">
							<div class="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
								<Icon class="h-4 w-4" />
							</div>
							{#if attention}
								<div class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" aria-hidden="true"></div>
								<span class="sr-only">Action required</span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-semibold text-foreground">{meta.title}</div>
							<div class="text-xs text-muted-foreground truncate">{meta.description}</div>
						</div>
						<ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
					</button>
				{/each}
			</nav>

			<!-- App navigation sections (Global Settings only) -->
			{#if showAppWideSettings && !isNewBond}
				<div class="pt-2">
					<div class="flex items-center gap-2 px-1 pb-2">
						<div class="flex-1 h-px bg-border"></div>
						<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">App</span>
						<div class="flex-1 h-px bg-border"></div>
					</div>
					<nav class="space-y-2">
						{#each APP_SECTIONS as key (key)}
							{@const meta = SECTION_META[key]}
							{@const Icon = meta.icon}
							{@const attention = meta.needsAttention?.() ?? false}
							<button
								type="button"
								class="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-card/70 hover:bg-accent/60 transition-colors text-left cursor-pointer"
								onclick={() => (activeSection = key)}
							>
								<div class="relative h-9 w-9 shrink-0">
									<div class="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
										<Icon class="h-4 w-4" />
									</div>
									{#if attention}
										<div class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" aria-hidden="true"></div>
										<span class="sr-only">Action required</span>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="text-sm font-semibold text-foreground">{meta.title}</div>
									<div class="text-xs text-muted-foreground truncate">{meta.description}</div>
								</div>
								<ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
							</button>
						{/each}
					</nav>
				</div>
			{/if}

			<!-- Delete Bond Button (Scoped edit mode when multiple bonds exist) -->
			{#if !showAppWideSettings && profileStore.state.bonds.length > 1}
				<div class="pt-2 border-t border-border">
					<Button
						variant="outline"
						class="w-full text-destructive hover:bg-destructive/10"
						onclick={() => (isDeleteConfirmOpen = true)}
					>
						<Trash2 class="h-4 w-4 mr-1.5" />
						<span>Delete "{currentBond.names}"</span>
					</Button>
				</div>
			{/if}
		{:else if activeSection === 'identity'}
			<BondIdentityForm
				{isNewBond}
				{currentBond}
				{bondType}
				{bondNames}
				{bondTogetherSince}
				{bondPhotoUrl}
				{photoUploadError}
				{isPhotoSaving}
				onTypeChange={handleTypeChange}
				onNamesChange={(val) => {
					bondNames = val;
					void handleLiveUpdate({ names: val });
				}}
				onDateChange={(val) => {
					bondTogetherSince = val;
					void handleLiveUpdate({ togetherSince: val });
				}}
				onPhotoUpload={handlePhotoUpload}
				onPhotoRemove={removePhoto}
			/>
		{:else if activeSection === 'appearance'}
			<!-- UI Style Theme (Configured Per-Bond) -->
			<section>
				<ThemeSelector
					value={activeTheme}
					allowExpand={true}
					onchange={(theme) => {
						bondUiTheme = theme;
						void profileStore.setUITheme(theme, currentBond.id);
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
						void profileStore.setColorMode(mode, currentBond.id);
					}}
				/>

				<!-- Accent Palette -->
				<ColorPaletteSelector
					value={activePalette}
					onchange={(palette) => {
						bondColorPalette = palette;
						void profileStore.setColorPalette(palette, currentBond.id);
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
					checked={currentBond.showSeconds ?? profileStore.state.showSeconds}
					onchange={(val) => {
						bondShowSeconds = val;
						handleLiveUpdate({ showSeconds: val });
					}}
				/>
			</section>
		{:else if activeSection === 'milestones'}
			<!-- Per-bond celebration cards toggle -->
			<section class="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border">
				<div class="space-y-0.5 pr-2">
					<div class="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<PartyPopper class="h-4 w-4 text-primary shrink-0" />
						<span>Celebration Cards</span>
					</div>
					<div class="text-xs text-muted-foreground">
						Auto-show full-screen celebration on milestone days for this bond
					</div>
				</div>
				<Switch
					checked={currentBond.autoCelebrateMilestones ?? true}
					onchange={(val) => {
						bondAutoCelebrate = val;
						void profileStore.setAutoCelebrateMilestones(val, currentBond.id);
					}}
				/>
			</section>

			<MilestonesList {currentBond} />
		{:else if activeSection === 'alerts'}
			{#if !profileStore.state.pushSubscribed}
				<!-- Device status hint -->
				<section class="p-3.5 rounded-2xl bg-muted/40 border border-dashed border-border space-y-2.5">
					<div class="flex items-center gap-2 text-xs text-muted-foreground">
						<BellOff class="h-4 w-4 shrink-0" />
						<span>Device notifications are not set up. Enable them in <strong>App → Device Notifications</strong> to receive milestone alerts.</span>
					</div>
					{#if showAppWideSettings}
						<Button
							size="sm"
							variant="outline"
							class="w-full h-8 text-xs font-semibold"
							onclick={() => (activeSection = 'deviceNotifications')}
						>
							<span>Set up Device Notifications →</span>
						</Button>
					{/if}
				</section>
			{/if}

			<!-- MilestonePrefsEditor always shown (dimmed when not subscribed) -->
			<div class={!profileStore.state.pushSubscribed ? 'opacity-50 pointer-events-none' : ''}>
				<MilestonePrefsEditor
					{isNewBond}
					{currentBond}
					bind:notificationsEnabled={bondNotificationsEnabled}
					bind:years={bondYearsPref}
					bind:months={bondMonthsPref}
					bind:days={bondDaysPref}
					bind:custom={bondCustomPref}
					onNotificationsChange={(v) => handleLiveUpdate({ notificationsEnabled: v })}
					onPrefsChange={(prefs) => handleLiveUpdate({ milestonePrefs: prefs })}
				/>
			</div>
		{:else if showAppWideSettings && activeSection === 'deviceNotifications'}
			<!-- Global autoCelebrateMilestones master toggle -->
			<section class="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border">
				<div class="space-y-0.5 pr-2">
					<div class="text-sm font-semibold text-foreground flex items-center gap-1.5">
						<Sparkles class="h-4 w-4 text-primary shrink-0" />
						<span>Celebration Cards — All Bonds</span>
					</div>
					<div class="text-xs text-muted-foreground">
						Global override: disable celebration cards across every bond
					</div>
				</div>
				<Switch
					checked={profileStore.state.autoCelebrateMilestones ?? true}
					onchange={(val) => void profileStore.setGlobalAutoCelebrateMilestones(val)}
				/>
			</section>

			<PushNotificationPanel {currentBond} />
		{:else if showAppWideSettings && activeSection === 'data'}
			<StorageBackupPanel
				{open}
				onScanQR={() => (isScanModalOpen = true)}
				onAfterReset={() => {
					open = false;
					onclose?.();
				}}
			/>
		{:else if showAppWideSettings && activeSection === 'about'}
			<AboutPanel />
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

<ConfirmModal
	bind:open={isDeleteConfirmOpen}
	title="Delete Bond"
	message={`Are you sure you want to delete "${currentBond.names}"? This cannot be undone.`}
	confirmLabel="Delete"
	variant="destructive"
	onConfirm={handleDeleteCurrentBond}
/>

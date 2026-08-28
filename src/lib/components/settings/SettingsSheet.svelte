<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { UIThemeId, ColorMode, ColorPalette } from '$lib/types/profile';
	import type { Bond, BondType, DaysMilestoneFilter } from '$lib/types/bonds';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Switch from '$lib/components/ui/switch';
	import { Trash2, Plus, QrCode, Users, Clock, BellOff, UserRound, Palette, Bell, Flag, Database, ChevronRight } from '@lucide/svelte';
	import ScanImportModal from '$lib/components/share/ScanImportModal.svelte';
	import ThemeSelector from '$lib/components/shared/ThemeSelector.svelte';
	import ColorModeSelector from '$lib/components/shared/ColorModeSelector.svelte';
	import ColorPaletteSelector from '$lib/components/shared/ColorPaletteSelector.svelte';
	import BondIdentityForm from './BondIdentityForm.svelte';
	import MilestonePrefsEditor from './MilestonePrefsEditor.svelte';
	import MilestonesList from './MilestonesList.svelte';
	import PushNotificationPanel from './PushNotificationPanel.svelte';
	import StorageBackupPanel from './StorageBackupPanel.svelte';

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

	// Root-list/sub-view navigation within the drawer (existing-bond editing
	// only — new-bond creation stays a single flat form, see below).
	type SettingsSection = 'identity' | 'appearance' | 'notifications' | 'milestones' | 'data';
	let activeSection = $state<SettingsSection | null>(null);

	const SECTION_META: Record<SettingsSection, { title: string; description: string; icon: typeof UserRound }> = {
		identity: { title: 'Identity', description: 'Names, date, and photo', icon: UserRound },
		appearance: { title: 'Appearance', description: 'Theme, colors, and display', icon: Palette },
		notifications: { title: 'Notifications', description: 'Device alerts and milestone preferences', icon: Bell },
		milestones: { title: 'Milestones', description: 'Upcoming and custom milestones', icon: Flag },
		data: { title: 'Data & Backup', description: 'Storage, backup, restore, and reset', icon: Database }
	};
	const SETTINGS_SECTIONS: SettingsSection[] = ['identity', 'appearance', 'notifications', 'milestones', 'data'];

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

	// Sync local form state when opening or switching target bond
	$effect(() => {
		if (open) {
			activeSection = null;
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

		// Captured before the `addBond` await below: adding the bond makes it
		// active, which changes `profileStore.activeBond` — a dependency this
		// component's mount `$effect` reads inside its `isNewBond` branch. Svelte
		// re-runs that effect on the resulting microtask (while this function is
		// still suspended on the `await`), and since `open`/`isNewBond` are both
		// still true at that point, it resets every draft field, including
		// `bondPhotoBlob`, back to its initial value. Re-reading the reactive
		// `bondPhotoBlob` after the await silently drops whatever photo was
		// picked; the captured local doesn't.
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
			showSeconds: bondShowSeconds
		};

		await profileStore.addBond(newBond);
		if (photoToSave) {
			await profileStore.setPhoto(photoToSave, newBond.id);
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
</script>

<Modal
	bind:open
	title={activeSection
		? SECTION_META[activeSection].title
		: isNewBond
			? 'Add Relationship or Friendship'
			: showAppWideSettings
				? 'Settings & Customization'
				: `Edit ${currentBond.type === 'friendship' ? 'Friendship' : 'Relationship'}`}
	description={activeSection
		? SECTION_META[activeSection].description
		: isNewBond
			? 'Track another romantic relationship or friendship'
			: showAppWideSettings
				? 'Customize your relationship tracker'
				: `Configure names, dates, themes, and notifications`}
	onBack={activeSection ? () => (activeSection = null) : undefined}
	{onclose}
>
	<div class="space-y-6 pb-4">
		{#if !isNewBond && activeSection === null}
			<!-- Active Bond Switcher Quick Action (Header gear mode only when multiple bonds exist) -->
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
						<Button variant="outline" size="sm" class="w-full mt-1.5" onclick={onOpenSwitcher}>
							<span>Manage & Switch Bonds ({profileStore.state.bonds.length})</span>
						</Button>
					{/if}
				</section>
			{/if}

			<!-- Settings navigation list -->
			<nav class="space-y-2">
				{#each SETTINGS_SECTIONS as key (key)}
					{@const meta = SECTION_META[key]}
					{@const Icon = meta.icon}
					{#if key !== 'data' || showAppWideSettings}
						<button
							type="button"
							class="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-card/70 hover:bg-accent/60 transition-colors text-left cursor-pointer"
							onclick={() => (activeSection = key)}
						>
							<div class="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
								<Icon class="h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="text-sm font-semibold text-foreground">{meta.title}</div>
								<div class="text-xs text-muted-foreground truncate">{meta.description}</div>
							</div>
							<ChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
						</button>
					{/if}
				{/each}
			</nav>

			<!-- Delete Bond Button (Scoped edit mode when multiple bonds exist) -->
			{#if !showAppWideSettings && profileStore.state.bonds.length > 1}
				<div class="pt-2 border-t border-border">
					<Button variant="outline" class="w-full text-destructive hover:bg-destructive/10" onclick={handleDeleteCurrentBond}>
						<Trash2 class="h-4 w-4 mr-1.5" />
						<span>Delete Bond</span>
					</Button>
				</div>
			{/if}
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

		{#if isNewBond || activeSection === 'identity'}
			<BondIdentityForm
				{isNewBond}
				{currentBond}
				{bondType}
				{bondNames}
				{bondTogetherSince}
				{bondPhotoUrl}
				onTypeChange={handleTypeChange}
				onNamesChange={(val) => {
					bondNames = val;
					if (!isNewBond) void handleLiveUpdate({ names: val });
				}}
				onDateChange={(val) => {
					bondTogetherSince = val;
					if (!isNewBond) void handleLiveUpdate({ togetherSince: val });
				}}
				onPhotoUpload={handlePhotoUpload}
				onPhotoRemove={removePhoto}
			/>
		{/if}

		{#if isNewBond || activeSection === 'appearance'}
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
		{/if}

		{#if isNewBond || activeSection === 'notifications'}
			<!-- Device Notifications (App-Wide) — moved above Bond Notifications so the
			     master toggle a bond's alerts actually depend on is visible before it. -->
			{#if showAppWideSettings && !isNewBond}
				<PushNotificationPanel {currentBond} />
			{/if}

			<!-- Bond Notifications: meaningless without an active device subscription
			     to actually deliver them, so only shown once one exists. -->
			{#if profileStore.state.pushSubscribed}
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
			{:else}
				<section class="p-3.5 rounded-2xl bg-muted/40 border border-dashed border-border flex items-center gap-2.5 text-xs text-muted-foreground">
					<BellOff class="h-4 w-4 shrink-0" />
					<span>Turn on Device Notifications to choose which milestones alert you for this bond.</span>
				</section>
			{/if}
		{/if}

		{#if !isNewBond && activeSection === 'milestones'}
			<MilestonesList {currentBond} />
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

		{#if showAppWideSettings && !isNewBond && activeSection === 'data'}
			<StorageBackupPanel
				{open}
				onScanQR={() => (isScanModalOpen = true)}
				onAfterReset={() => {
					open = false;
					onclose?.();
				}}
			/>
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

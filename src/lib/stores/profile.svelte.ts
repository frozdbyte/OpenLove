import {
	DEFAULT_APP_STATE,
	DEFAULT_PRIMARY_BOND,
	DEFAULT_PROFILE,
	loadAppStateFromStorage,
	saveAppStateToStorage,
	saveBondPhoto,
	clearAllStorage
} from '$lib/storage/db';
import type { CoupleProfile, ColorMode, ColorPalette, UIThemeId } from '$lib/types/profile';
import {
	DEFAULT_MILESTONE_PREFS_FRIENDSHIP,
	DEFAULT_MILESTONE_PREFS_ROMANTIC,
	type AppState,
	type Bond
} from '$lib/types/bonds';

export type ProfileMutationHook = (
	next: AppState,
	previous: AppState
) => void | Promise<void>;

const mutationHooks = new Set<ProfileMutationHook>();

export function onProfileMutation(hook: ProfileMutationHook): () => void {
	mutationHooks.add(hook);
	return () => mutationHooks.delete(hook);
}

const PALETTE_PRIMARY_HEX: Record<ColorPalette, { light: string; dark: string }> = {
	rose: { light: '#e11d48', dark: '#f43f5e' },
	lavender: { light: '#8b5cf6', dark: '#a78bfa' },
	terracotta: { light: '#ea580c', dark: '#fb923c' },
	sage: { light: '#059669', dark: '#34d399' },
	midnight: { light: '#2563eb', dark: '#60a5fa' }
};

class ProfileStore {
	state = $state<AppState>({ ...DEFAULT_APP_STATE });
	isLoading = $state(true);
	isInitialized = $state(false);

	/** Active bond currently selected in the UI */
	activeBond = $derived<Bond>(
		this.state.bonds.find((b) => b.id === this.state.activeBondId) ||
			this.state.bonds[0] ||
			DEFAULT_PRIMARY_BOND
	);

	/**
	 * Backward compatibility alias for components reading `profileStore.profile`.
	 * Reflects the active bond's data and UI preferences.
	 */
	get profile(): CoupleProfile {
		const active = this.activeBond;
		return {
			names: active.names,
			togetherSince: active.togetherSince,
			photoBlob: active.photoBlob,
			photoUrl: active.photoUrl,
			uiTheme: active.uiTheme ?? this.state.uiTheme,
			colorMode: active.colorMode ?? this.state.colorMode,
			colorPalette: active.colorPalette ?? this.state.colorPalette,
			showSeconds: active.showSeconds ?? this.state.showSeconds,
			isConfigured: this.state.isConfigured,
			pushSubscribed: this.state.pushSubscribed,
			pushIntent: this.state.pushIntent,
			customMilestones: active.customMilestones
		};
	}

	/**
	 * Resolves once IndexedDB has been read.

	 */
	readonly ready: Promise<void>;
	private resolveReady!: () => void;

	constructor() {
		this.ready = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});

		if (typeof window !== 'undefined') {
			try {
				const mode = localStorage.getItem('openlove_theme_mode') as ColorMode | null;
				const palette = localStorage.getItem('openlove_theme_palette') as ColorPalette | null;
				const ui = localStorage.getItem('openlove_theme_ui') as UIThemeId | null;
				if (mode) this.state.colorMode = mode;
				if (palette) this.state.colorPalette = palette;
				if (ui) this.state.uiTheme = ui;
			} catch {}

			this.init();
		} else {
			this.resolveReady();
		}
	}

	async init() {
		try {
			const loaded = await loadAppStateFromStorage();
			this.state = loaded;
			this.applyThemeAndDarkMode();
			this.setupSystemDarkModeListener();
		} catch (error) {
			console.error('Failed to initialize profile store:', error);
		} finally {
			this.isLoading = false;
			this.isInitialized = true;
			this.resolveReady();
		}
	}

	applyThemeAndDarkMode() {
		if (typeof document === 'undefined') return;

		const root = document.documentElement;
		const active = this.activeBond;
		const colorMode = active.colorMode ?? this.state.colorMode;
		const colorPalette = active.colorPalette ?? this.state.colorPalette;
		const uiTheme = active.uiTheme ?? this.state.uiTheme;

		try {
			localStorage.setItem('openlove_theme_mode', colorMode);
			localStorage.setItem('openlove_theme_palette', colorPalette);
			localStorage.setItem('openlove_theme_ui', uiTheme);
		} catch {}

		root.setAttribute('data-theme', colorPalette);

		let isDark = false;
		if (colorMode === 'dark') {
			isDark = true;
		} else if (colorMode === 'light') {
			isDark = false;
		} else {
			isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
		}

		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}

		const metaTheme = document.querySelector('meta[name="theme-color"]');
		if (metaTheme) {
			const paletteHex = PALETTE_PRIMARY_HEX[colorPalette] || PALETTE_PRIMARY_HEX.rose;
			if (uiTheme === 'traditional') {
				metaTheme.setAttribute('content', isDark ? paletteHex.dark : paletteHex.light);
			} else {
				metaTheme.setAttribute('content', isDark ? '#18181b' : paletteHex.light);
			}
		}
	}

	private setupSystemDarkModeListener() {
		if (typeof window === 'undefined') return;
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', () => {
			const active = this.activeBond;
			const mode = active.colorMode ?? this.state.colorMode;
			if (mode === 'system') {
				this.applyThemeAndDarkMode();
			}
		});
	}

	private notifyMutation(previous: AppState) {
		const next = { ...this.state };
		for (const hook of mutationHooks) {
			try {
				void Promise.resolve(hook(next, previous)).catch((err) =>
					console.error('Profile mutation hook failed:', err)
				);
			} catch (err) {
				console.error('Profile mutation hook threw:', err);
			}
		}
	}

	/**
	 * Switch active displayed bond.
	 */
	async setActiveBond(id: string) {
		if (this.state.activeBondId === id) return;
		const previous = { ...this.state };
		this.state.activeBondId = id;
		const nextActive = this.state.bonds.find((b) => b.id === id);
		if (nextActive) {
			if (nextActive.uiTheme) this.state.uiTheme = nextActive.uiTheme;
			if (nextActive.colorPalette) this.state.colorPalette = nextActive.colorPalette;
			if (nextActive.colorMode) this.state.colorMode = nextActive.colorMode;
			if (nextActive.showSeconds !== undefined) this.state.showSeconds = nextActive.showSeconds;
		}
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}


	/**
	 * Add a new bond. Inherits UI theme and color palette from the currently active bond.
	 */
	async addBond(newBond: Partial<Bond>) {
		const currentActive = this.activeBond;
		const bond: Bond = {
			id: newBond.id || `bond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			type: newBond.type || 'romantic',
			names: newBond.names || '',
			togetherSince: newBond.togetherSince || new Date().toISOString().split('T')[0],
			photoBlob: newBond.photoBlob ?? null,
			photoUrl: newBond.photoUrl,
			customMilestones: newBond.customMilestones || [],
			notificationsEnabled: newBond.notificationsEnabled ?? true,
			milestonePrefs:
				newBond.milestonePrefs ||
				(newBond.type === 'friendship'
					? DEFAULT_MILESTONE_PREFS_FRIENDSHIP
					: DEFAULT_MILESTONE_PREFS_ROMANTIC),
			uiTheme: newBond.uiTheme ?? currentActive.uiTheme ?? this.state.uiTheme,
			colorPalette: newBond.colorPalette ?? currentActive.colorPalette ?? this.state.colorPalette,
			colorMode: newBond.colorMode ?? currentActive.colorMode ?? this.state.colorMode,
			showSeconds: newBond.showSeconds ?? currentActive.showSeconds ?? this.state.showSeconds
		};

		const previous = { ...this.state };
		this.state.bonds = [...this.state.bonds, bond];
		this.state.activeBondId = bond.id;
		this.state.isConfigured = true;
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
		return bond;
	}

	/**
	 * Update an existing bond.
	 */
	async updateBond(id: string, patch: Partial<Bond>) {
		const previous = { ...this.state };
		this.state.bonds = this.state.bonds.map((b) => (b.id === id ? { ...b, ...patch } : b));
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Delete a bond.
	 */
	async deleteBond(id: string) {
		if (this.state.bonds.length <= 1) {
			// Don't delete last bond, reset it
			await this.reset();
			return;
		}
		const previous = { ...this.state };
		const nextBonds = this.state.bonds.filter((b) => b.id !== id);
		this.state.bonds = nextBonds;
		if (this.state.activeBondId === id) {
			this.state.activeBondId = nextBonds[0].id;
		}
		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Update fields on active bond or global settings (backward compatible).
	 */
	async update(fields: Partial<CoupleProfile>) {
		const previous = { ...this.state };

		// Split global fields vs bond fields
		const {
			names,
			togetherSince,
			customMilestones,
			uiTheme,
			colorMode,
			colorPalette,
			showSeconds,
			isConfigured,
			pushSubscribed,
			pushIntent
		} = fields;

		if (isConfigured !== undefined) this.state.isConfigured = isConfigured;
		if (pushSubscribed !== undefined) this.state.pushSubscribed = pushSubscribed;
		if (pushIntent !== undefined) this.state.pushIntent = pushIntent;

		// Update active bond
		this.state.bonds = this.state.bonds.map((b) => {
			if (b.id === this.state.activeBondId) {
				return {
					...b,
					names: names !== undefined ? names : b.names,
					togetherSince: togetherSince !== undefined ? togetherSince : b.togetherSince,
					customMilestones: customMilestones !== undefined ? customMilestones : b.customMilestones,
					uiTheme: uiTheme !== undefined ? uiTheme : b.uiTheme,
					colorPalette: colorPalette !== undefined ? colorPalette : b.colorPalette,
					colorMode: colorMode !== undefined ? colorMode : b.colorMode,
					showSeconds: showSeconds !== undefined ? showSeconds : b.showSeconds
				};
			}
			return b;
		});

		this.applyThemeAndDarkMode();
		await saveAppStateToStorage(this.state);
		this.notifyMutation(previous);
	}

	/**
	 * Set or replace photo for a bond (defaults to active bond).
	 */
	async setPhoto(blob: Blob | null, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		const currentBond = this.state.bonds.find((b) => b.id === bondId);
		const { blob: newBlob, url } = await saveBondPhoto(bondId, blob, currentBond?.photoUrl);

		this.state.bonds = this.state.bonds.map((b) =>
			b.id === bondId ? { ...b, photoBlob: newBlob, photoUrl: url } : b
		);
		await saveAppStateToStorage(this.state);
	}

	async setUITheme(uiTheme: UIThemeId, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { uiTheme });
		if (bondId === this.state.activeBondId) {
			this.state.uiTheme = uiTheme;
		}
	}

	async setColorMode(colorMode: ColorMode, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { colorMode });
		if (bondId === this.state.activeBondId) {
			this.state.colorMode = colorMode;
		}
	}

	async setColorPalette(colorPalette: ColorPalette, targetBondId?: string) {
		const bondId = targetBondId || this.state.activeBondId;
		await this.updateBond(bondId, { colorPalette });
		if (bondId === this.state.activeBondId) {
			this.state.colorPalette = colorPalette;
		}
	}


	async completeOnboarding() {
		await this.update({ isConfigured: true });
	}

	/**
	 * Reset all data to fresh state.
	 */
	async reset() {
		const previous = { ...this.state };
		const photoUrls = this.state.bonds.map((b) => b.photoUrl).filter(Boolean) as string[];
		await clearAllStorage(photoUrls);
		this.state = JSON.parse(JSON.stringify(DEFAULT_APP_STATE));
		this.applyThemeAndDarkMode();
		this.notifyMutation(previous);
	}

	/**
	 * Export full application state or single active bond to JSON.
	 */
	exportJSON(activeOnly = false): string {
		if (activeOnly) {
			const active = this.activeBond;
			const exportable = {
				version: 2,
				isSingleBond: true,
				bond: {
					names: active.names,
					type: active.type,
					togetherSince: active.togetherSince,
					customMilestones: active.customMilestones,
					milestonePrefs: active.milestonePrefs,
					uiTheme: active.uiTheme ?? this.state.uiTheme,
					colorPalette: active.colorPalette ?? this.state.colorPalette,
					colorMode: active.colorMode ?? this.state.colorMode,
					showSeconds: active.showSeconds ?? this.state.showSeconds
				},
				uiTheme: active.uiTheme ?? this.state.uiTheme,
				colorMode: active.colorMode ?? this.state.colorMode,
				colorPalette: active.colorPalette ?? this.state.colorPalette,
				showSeconds: active.showSeconds ?? this.state.showSeconds,
				exportedAt: new Date().toISOString()
			};

			return JSON.stringify(exportable, null, 2);
		}

		const exportable = {
			version: 2,
			activeBondId: this.state.activeBondId,
			bonds: this.state.bonds.map(({ photoBlob, photoUrl, ...rest }) => rest),
			uiTheme: this.state.uiTheme,
			colorMode: this.state.colorMode,
			colorPalette: this.state.colorPalette,
			showSeconds: this.state.showSeconds,
			exportedAt: new Date().toISOString()
		};
		return JSON.stringify(exportable, null, 2);
	}

	/**
	 * Import profile / bond data from JSON.
	 * Supports mode: 'auto' | 'replace' | 'add'.
	 */
	async importJSON(jsonStr: string, mode: 'auto' | 'replace' | 'add' = 'auto'): Promise<boolean> {
		try {
			const data = JSON.parse(jsonStr);

			// Case 1: V2 full backup (always replaces full state)
			if (data.version === 2 && Array.isArray(data.bonds) && data.bonds.length > 0) {
				const previous = { ...this.state };
				this.state = {
					activeBondId: data.activeBondId || data.bonds[0].id,
					bonds: data.bonds.map((b: Partial<Bond>) => ({
						id: b.id || `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
						type: b.type || 'romantic',
						names: b.names || 'Emma & Paul',
						togetherSince: b.togetherSince || new Date().toISOString().split('T')[0],
						photoBlob: null,
						photoUrl: undefined,
						customMilestones: Array.isArray(b.customMilestones) ? b.customMilestones : [],
						notificationsEnabled: b.notificationsEnabled ?? true,
						milestonePrefs: {
							years: b.milestonePrefs?.years ?? true,
							months: b.milestonePrefs?.months ?? (b.type === 'friendship' ? false : true),
							days: b.milestonePrefs?.days ?? (b.type === 'friendship' ? 'major' : 'all'),
							custom: b.milestonePrefs?.custom ?? true
						},
						uiTheme: b.uiTheme || data.uiTheme || 'modern',
						colorPalette: b.colorPalette || data.colorPalette || 'rose',
						colorMode: b.colorMode || data.colorMode || 'system',
						showSeconds: b.showSeconds ?? data.showSeconds ?? true
					})),
					uiTheme: data.uiTheme || 'modern',
					colorMode: data.colorMode || 'system',
					colorPalette: data.colorPalette || 'rose',
					showSeconds: data.showSeconds ?? true,
					isConfigured: true,
					pushSubscribed: this.state.pushSubscribed,
					pushIntent: this.state.pushIntent
				};
				this.applyThemeAndDarkMode();
				await saveAppStateToStorage(this.state);
				this.notifyMutation(previous);
				return true;
			}

			// Case 2: V2 Single Bond invite
			if (data.isSingleBond && data.bond?.names && data.bond?.togetherSince) {
				const b = data.bond;
				const newBond: Bond = {
					id: `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					type: b.type || 'romantic',
					names: b.names,
					togetherSince: b.togetherSince,
					photoBlob: null,
					photoUrl: undefined,
					customMilestones: Array.isArray(b.customMilestones) ? b.customMilestones : [],
					notificationsEnabled: true,
					milestonePrefs: {
						years: b.milestonePrefs?.years ?? true,
						months: b.milestonePrefs?.months ?? (b.type === 'friendship' ? false : true),
						days: b.milestonePrefs?.days ?? (b.type === 'friendship' ? 'major' : 'all'),
						custom: b.milestonePrefs?.custom ?? true
					},
					uiTheme: b.uiTheme || data.uiTheme || 'modern',
					colorPalette: b.colorPalette || data.colorPalette || 'rose',
					colorMode: b.colorMode || data.colorMode || 'system',
					showSeconds: b.showSeconds ?? data.showSeconds ?? true
				};

				if (mode === 'replace') {
					// Overwrite current active bond
					await this.updateBond(this.state.activeBondId, {
						type: newBond.type,
						names: newBond.names,
						togetherSince: newBond.togetherSince,
						customMilestones: newBond.customMilestones,
						milestonePrefs: newBond.milestonePrefs,
						uiTheme: newBond.uiTheme,
						colorPalette: newBond.colorPalette,
						colorMode: newBond.colorMode,
						showSeconds: newBond.showSeconds
					});
					await this.update({ isConfigured: true });
				} else if (mode === 'add') {
					await this.addBond(newBond);
				} else {
					// Auto mode: replace if unconfigured initial bond, else add
					if (this.state.bonds.length <= 1 && !this.state.isConfigured) {
						this.state.bonds = [newBond];
						this.state.activeBondId = newBond.id;
						this.state.isConfigured = true;
						this.applyThemeAndDarkMode();
						await saveAppStateToStorage(this.state);
					} else {
						await this.addBond(newBond);
					}
				}
				return true;
			}

			// Case 3: V1 legacy single profile
			if (data.togetherSince && data.names) {
				const migratedBond: Bond = {
					id: `bond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
					type: 'romantic',
					names: data.names,
					togetherSince: data.togetherSince,
					photoBlob: null,
					photoUrl: undefined,
					customMilestones: Array.isArray(data.customMilestones) ? data.customMilestones : [],
					notificationsEnabled: true,
					milestonePrefs: { ...DEFAULT_MILESTONE_PREFS_ROMANTIC },
					uiTheme: data.uiTheme || 'modern',
					colorPalette: data.colorPalette || 'rose',
					colorMode: data.colorMode || 'system',
					showSeconds: data.showSeconds ?? true
				};

				if (mode === 'replace' || (mode === 'auto' && (!this.state.isConfigured || this.state.bonds.length <= 1))) {
					await this.updateBond(this.state.activeBondId, migratedBond);
					await this.update({ isConfigured: true });
				} else {
					await this.addBond(migratedBond);
				}
				return true;
			}

			return false;
		} catch (error) {
			console.error('Failed to import profile JSON:', error);
			return false;
		}
	}
}

/**
 * Helper to safely extract incoming bond data for previews.
 */
export function parseSharePayload(rawOrJson: string): Partial<Bond> | null {
	try {
		let jsonString = '';
		if (rawOrJson.includes('#import=')) {
			const encoded = rawOrJson.split('#import=')[1];
			jsonString = atob(decodeURIComponent(encoded));
		} else if (rawOrJson.startsWith('{')) {
			jsonString = rawOrJson;
		} else {
			try {
				jsonString = atob(rawOrJson);
			} catch {
				jsonString = rawOrJson;
			}
		}

		const data = JSON.parse(jsonString);
		if (data.isSingleBond && data.bond?.names && data.bond?.togetherSince) {
			const b = data.bond;
			return {
				names: b.names,
				type: b.type || 'romantic',
				togetherSince: b.togetherSince,
				customMilestones: Array.isArray(b.customMilestones) ? b.customMilestones : [],
				milestonePrefs: b.milestonePrefs,
				uiTheme: b.uiTheme || data.uiTheme || 'modern',
				colorPalette: b.colorPalette || data.colorPalette || 'rose',
				colorMode: b.colorMode || data.colorMode || 'system',
				showSeconds: b.showSeconds ?? data.showSeconds ?? true
			};
		} else if (data.togetherSince && data.names) {
			return {
				names: data.names,
				type: 'romantic',
				togetherSince: data.togetherSince,
				customMilestones: Array.isArray(data.customMilestones) ? data.customMilestones : [],
				uiTheme: data.uiTheme || 'modern',
				colorPalette: data.colorPalette || 'rose',
				colorMode: data.colorMode || 'system',
				showSeconds: data.showSeconds ?? true
			};
		}
	} catch (err) {
		console.error('Failed to parse share payload:', err);
	}
	return null;
}

export const profileStore = new ProfileStore();


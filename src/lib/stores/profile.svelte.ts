import {
	DEFAULT_PROFILE,
	loadProfileFromStorage,
	saveProfileToStorage,
	savePhotoBlob,
	clearProfileStorage
} from '$lib/storage/db';
import type { CoupleProfile, ColorMode, ColorPalette, UIThemeId } from '$lib/types/profile';

/**
 * Mutation hooks.
 *
 * `togetherSince` used to be sent to the server exactly once, at subscribe time,
 * while three separate call sites mutated it afterwards (the settings date picker,
 * onboarding, and QR/partner-link import) and never touched the network. Changing
 * the anniversary date after subscribing left the server firing milestone pushes
 * on the old schedule forever.
 *
 * All three funnel through `update()`, so one hook here closes all three. It is a
 * callback registry rather than a direct import because `$lib/sync` imports this
 * module, and importing it back would be circular.
 */
export type ProfileMutationHook = (
	next: CoupleProfile,
	previous: CoupleProfile
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
	profile = $state<CoupleProfile>({ ...DEFAULT_PROFILE });
	isLoading = $state(true);
	isInitialized = $state(false);

	/**
	 * Resolves once IndexedDB has been read.
	 *
	 * Anything that syncs profile data to the server must await this first —
	 * `profile` holds `DEFAULT_PROFILE` (with *today* as `togetherSince`) until the
	 * load completes, and syncing that would overwrite the real anniversary date.
	 */
	readonly ready: Promise<void>;
	private resolveReady!: () => void;

	constructor() {
		this.ready = new Promise<void>((resolve) => {
			this.resolveReady = resolve;
		});

		if (typeof window !== 'undefined') {
			// Synchronously populate initial visual preferences from localStorage cache
			// so the reactive profile state matches document state before IndexedDB loads
			try {
				const mode = localStorage.getItem('openlove_theme_mode') as ColorMode | null;
				const palette = localStorage.getItem('openlove_theme_palette') as ColorPalette | null;
				const ui = localStorage.getItem('openlove_theme_ui') as UIThemeId | null;
				if (mode) this.profile.colorMode = mode;
				if (palette) this.profile.colorPalette = palette;
				if (ui) this.profile.uiTheme = ui;
			} catch {}

			this.init();
		} else {
			this.resolveReady();
		}
	}

	async init() {
		try {
			const loaded = await loadProfileFromStorage();
			this.profile = loaded;
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

	private applyThemeAndDarkMode() {
		if (typeof document === 'undefined') return;

		const root = document.documentElement;
		const { colorMode, colorPalette, uiTheme } = this.profile;

		// Persist fast-path visual cache for zero-FOUC startup
		try {
			localStorage.setItem('openlove_theme_mode', colorMode);
			localStorage.setItem('openlove_theme_palette', colorPalette);
			localStorage.setItem('openlove_theme_ui', uiTheme);
		} catch {}

		// 1. Color Palette theme
		root.setAttribute('data-theme', colorPalette);

		// 2. Dark mode resolution
		let isDark = false;
		if (colorMode === 'dark') {
			isDark = true;
		} else if (colorMode === 'light') {
			isDark = false;
		} else {
			// system
			isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
		}

		if (isDark) {
			root.classList.add('dark');
		} else {
			root.classList.remove('dark');
		}

		// 3. Meta theme-color update
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
			if (this.profile.colorMode === 'system') {
				this.applyThemeAndDarkMode();
			}
		});
	}

	/**
	 * Update profile fields and persist to IndexedDB
	 */
	async update(fields: Partial<CoupleProfile>) {
		const previous = { ...this.profile };
		this.profile = { ...this.profile, ...fields };
		this.applyThemeAndDarkMode();
		await saveProfileToStorage(this.profile);
		this.notifyMutation(previous);
	}

	/**
	 * Local state is already persisted at this point, so a hook that fails (offline,
	 * for instance) must never surface as a failed profile update. The outbox is
	 * what makes the server catch up later.
	 */
	private notifyMutation(previous: CoupleProfile) {
		const next = { ...this.profile };
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
	 * Set or replace the couple photo Blob
	 */
	async setPhoto(blob: Blob | null) {
		const { blob: newBlob, url } = await savePhotoBlob(blob, this.profile.photoUrl);
		this.profile.photoBlob = newBlob;
		this.profile.photoUrl = url;
		await saveProfileToStorage(this.profile);
	}

	/**
	 * Set UI Theme (Modern vs Traditional)
	 */
	async setUITheme(uiTheme: UIThemeId) {
		await this.update({ uiTheme });
	}

	/**
	 * Set Dark Mode preference
	 */
	async setColorMode(colorMode: ColorMode) {
		await this.update({ colorMode });
	}

	/**
	 * Set Accent Color Palette
	 */
	async setColorPalette(colorPalette: ColorPalette) {
		await this.update({ colorPalette });
	}

	/**
	 * Mark onboarding as completed
	 */
	async completeOnboarding() {
		await this.update({ isConfigured: true });
	}

	/**
	 * Reset profile back to defaults
	 */
	async reset() {
		const previous = { ...this.profile };
		try {
			localStorage.removeItem('openlove_theme_mode');
			localStorage.removeItem('openlove_theme_palette');
			localStorage.removeItem('openlove_theme_ui');
		} catch {}
		await clearProfileStorage(this.profile.photoUrl);
		this.profile = { ...DEFAULT_PROFILE };
		this.applyThemeAndDarkMode();
		this.notifyMutation(previous);
	}

	/**
	 * Export profile data to portable JSON string
	 */
	exportJSON(): string {
		const exportable = {
			names: this.profile.names,
			togetherSince: this.profile.togetherSince,
			uiTheme: this.profile.uiTheme,
			colorMode: this.profile.colorMode,
			colorPalette: this.profile.colorPalette,
			showSeconds: this.profile.showSeconds,
			customMilestones: this.profile.customMilestones,
			version: 1,
			exportedAt: new Date().toISOString()
		};
		return JSON.stringify(exportable, null, 2);
	}

	/**
	 * Import profile data from JSON string
	 */
	async importJSON(jsonStr: string): Promise<boolean> {
		try {
			const data = JSON.parse(jsonStr);
			if (!data.togetherSince || !data.names) {
				return false;
			}

			await this.update({
				names: data.names,
				togetherSince: data.togetherSince,
				uiTheme: data.uiTheme || 'modern',
				colorMode: data.colorMode || 'system',
				colorPalette: data.colorPalette || 'rose',
				showSeconds: data.showSeconds ?? true,
				customMilestones: Array.isArray(data.customMilestones) ? data.customMilestones : [],
				isConfigured: true
			});
			return true;
		} catch (error) {
			console.error('Failed to import profile JSON:', error);
			return false;
		}
	}
}

export const profileStore = new ProfileStore();

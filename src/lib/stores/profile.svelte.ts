import {
	DEFAULT_PROFILE,
	loadProfileFromStorage,
	saveProfileToStorage,
	savePhotoBlob,
	clearProfileStorage
} from '$lib/storage/db';
import type { CoupleProfile, ColorMode, ColorPalette, UIThemeId } from '$lib/types/profile';

class ProfileStore {
	profile = $state<CoupleProfile>({ ...DEFAULT_PROFILE });
	isLoading = $state(true);
	isInitialized = $state(false);

	constructor() {
		if (typeof window !== 'undefined') {
			this.init();
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
		}
	}

	private applyThemeAndDarkMode() {
		if (typeof document === 'undefined') return;

		const root = document.documentElement;
		const { colorMode, colorPalette, uiTheme } = this.profile;

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
			if (uiTheme === 'traditional') {
				metaTheme.setAttribute('content', isDark ? '#4a0e17' : '#8B1E2D');
			} else {
				metaTheme.setAttribute('content', isDark ? '#18181b' : '#e11d48');
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
		this.profile = { ...this.profile, ...fields };
		this.applyThemeAndDarkMode();
		await saveProfileToStorage(this.profile);
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
		await clearProfileStorage(this.profile.photoUrl);
		this.profile = { ...DEFAULT_PROFILE };
		this.applyThemeAndDarkMode();
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

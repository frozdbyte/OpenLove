import type { ColorMode, ColorPalette, CustomMilestone, UIThemeId } from './profile';

export type BondType = 'romantic' | 'friendship';

export type DaysMilestoneFilter = 'all' | 'major' | 'off';

export interface MilestoneCategoryPrefs {
	years: boolean;    // 1st, 2nd, 5th, 10th year...
	months: boolean;   // 1-11 months, 18mo, 30mo... (defaults to false for friendships)
	days: DaysMilestoneFilter; // 'all' (50, 100...) | 'major' (1000, 2500...) | 'off'
	custom: boolean;   // User-added milestones
}

export interface Bond {
	id: string;                      // Unique UUID
	type: BondType;                  // 'romantic' | 'friendship'
	names: string;                   // e.g. "Emma & Paul" or "Alex & Sam"
	togetherSince: string;           // YYYY-MM-DD
	photoBlob?: Blob | null;         // Per-bond photo stored in IndexedDB
	photoUrl?: string;               // Active object URL
	customMilestones: CustomMilestone[];
	notificationsEnabled: boolean;   // Master notification toggle for this bond
	milestonePrefs: MilestoneCategoryPrefs;
	colorPalette?: ColorPalette;     // Optional per-bond accent override
}

export interface AppState {
	activeBondId: string;
	bonds: Bond[];
	uiTheme: UIThemeId;
	colorMode: ColorMode;
	colorPalette: ColorPalette;
	showSeconds: boolean;
	isConfigured: boolean;
	pushSubscribed: boolean;
	pushIntent: boolean;
}

export const DEFAULT_MILESTONE_PREFS_ROMANTIC: MilestoneCategoryPrefs = {
	years: true,
	months: true,
	days: 'all',
	custom: true
};

export const DEFAULT_MILESTONE_PREFS_FRIENDSHIP: MilestoneCategoryPrefs = {
	years: true,
	months: false,
	days: 'major',
	custom: true
};

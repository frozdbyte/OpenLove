import type { TimeBreakdown, NextMilestoneInfo, MilestoneItem } from './time';

export type UIThemeId = 'modern' | 'traditional' | 'cover';
export type ColorMode = 'system' | 'light' | 'dark';
export type ColorPalette = 'rose' | 'lavender' | 'terracotta' | 'sage' | 'midnight';

export interface CustomMilestone {
	id: string;
	title: string;
	date: string; // YYYY-MM-DD
}

export interface CoupleProfile {
	names: string;             // e.g. "Emma & Paul"
	togetherSince: string;     // YYYY-MM-DD
	photoBlob?: Blob | null;   // Full-res couple photo in IndexedDB
	photoUrl?: string;         // Active Object URL created from Blob
	uiTheme: UIThemeId;        // 'modern' | 'traditional'
	colorMode: ColorMode;      // 'system' | 'light' | 'dark'
	colorPalette: ColorPalette;// 'rose' | 'lavender' | ...
	showSeconds: boolean;      // Live ticking seconds toggle
	isConfigured: boolean;     // Has completed onboarding
	pushSubscribed: boolean;   // Server round-trip confirmed: this device is subscribed
	/**
	 * Local-only intent flag. `pushManager.subscribe()` has to reach the push service,
	 * so enabling notifications genuinely cannot complete offline. Toggling push on
	 * records the intent here and every outbox flush retries the real subscribe;
	 * `pushSubscribed` only flips true once the server round-trip succeeds.
	 * Never sent to the server and never exported.
	 */
	pushIntent: boolean;
	customMilestones: CustomMilestone[];
}

export interface ThemeProps {
	profile: CoupleProfile;
	timeBreakdown: TimeBreakdown;
	nextMilestone: NextMilestoneInfo | null;
	milestones: MilestoneItem[];
	onOpenSettings: () => void;
	onOpenShare: () => void;
}

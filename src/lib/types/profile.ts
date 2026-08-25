import type { TimeBreakdown, NextMilestoneInfo, MilestoneItem } from './time';

export type UIThemeId = 'modern' | 'traditional';
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
	pushSubscribed: boolean;   // Has active push subscription
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

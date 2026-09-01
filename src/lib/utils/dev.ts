import { featureFlags } from '$lib/stores/featureFlags.svelte';
import type { MilestoneItem } from '$lib/types/time';
import type { Bond } from '$lib/types/bonds';

export interface QueuedDevMilestone {
	bondId?: string; // target bond ID
	milestone: MilestoneItem;
	mode: 'modal' | 'toast';
	timestamp: number;
}

const QUEUED_DEV_MILESTONE_KEY = 'openlove_dev_queued_milestone_v1';

export const SIMULATED_BOND: Bond = {
	id: 'simulated_friend_bond',
	names: 'Alex & Sam (Friendship)',
	type: 'friendship',
	togetherSince: '2023-01-01',
	customMilestones: [],
	notificationsEnabled: true,
	milestonePrefs: { years: true, months: false, days: 'major', custom: true },
	uiTheme: 'botanical',
	colorPalette: 'sage',
	colorMode: 'system'
};

/**
 * Returns true when running in Vite dev server, OR when FEATURE_DEV_MODE=true
 * is set on the server and the featureFlags store has fetched it.
 *
 * Note: `featureFlags` initialises asynchronously from /api/share/config
 * (AGENTS.md Invariant 12). On first render this function may return false even
 * if FEATURE_DEV_MODE=true — the value corrects itself once the fetch resolves.
 * Do not use this in code that runs only once at module load time.
 */
export function isDevMode(): boolean {
	return Boolean(import.meta.env.DEV || featureFlags.flags.devMode);
}

export const isDev = isDevMode;

/**
 * Read any dev milestone queued for the next app launch.
 */
export function getQueuedDevMilestone(): QueuedDevMilestone | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(QUEUED_DEV_MILESTONE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/**
 * Queue a simulated milestone to automatically trigger on the next app reload / PWA launch.
 */
export function setQueuedDevMilestone(item: QueuedDevMilestone): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(QUEUED_DEV_MILESTONE_KEY, JSON.stringify(item));
	} catch (e) {
		console.warn('Failed to queue dev milestone:', e);
	}
}

/**
 * Clear the queued dev milestone.
 */
export function clearQueuedDevMilestone(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(QUEUED_DEV_MILESTONE_KEY);
	} catch {}
}

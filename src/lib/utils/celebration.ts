import type { Bond } from '$lib/types/bonds';
import type { MilestoneItem, MilestoneType } from '$lib/types/time';
import { calculateMilestones } from '$lib/utils/time';

const CELEBRATION_STORAGE_KEY = 'openlove_celebrations_v1';

/**
 * Compare two dates for calendar-day equality using the local clock.
 * Timezone-safe per AGENTS.md Invariant 10 (never uses `.toISOString().split('T')[0]`).
 */
export function isSameLocalCalendarDay(d1: Date, d2: Date): boolean {
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

/**
 * Format a Date as a local calendar YYYY-MM-DD string.
 */
export function toLocalCalendarDateString(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Milestone type priority ordering when multiple milestones coincide on the same day.
 */
const TYPE_PRIORITY: Record<string, number> = {
	years: 4,
	custom: 3,
	months: 2,
	days: 1
};

/**
 * Factory for synthetic MilestoneItem instances created from WebPush payloads or URL parameters.
 */
export function makePushMilestoneItem(
	title: string,
	id: string = 'push_celebrate',
	type: MilestoneType = 'years'
): MilestoneItem {
	return {
		id,
		title,
		daysRequired: 0,
		targetDate: new Date(),
		isAchieved: true,
		daysRemaining: 0,
		type,
		iconName: 'PartyPopper'
	};
}

/**
 * Check if a bond has a milestone occurring on today's local calendar day.
 * Returns the highest-priority milestone if multiple occur today.
 */
export function getTodayMilestoneForBond(bond: Bond, now: Date = new Date()): MilestoneItem | null {
	if (!bond.togetherSince) return null;

	const { milestones } = calculateMilestones(
		bond.togetherSince,
		bond.customMilestones,
		now,
		bond.milestonePrefs
	);

	const todayMilestones = milestones.filter((m) => isSameLocalCalendarDay(m.targetDate, now));
	if (todayMilestones.length === 0) return null;

	// Sort by priority (years > custom > months > days) and then by required days descending
	todayMilestones.sort((a, b) => {
		const prioA = TYPE_PRIORITY[a.type] ?? 0;
		const prioB = TYPE_PRIORITY[b.type] ?? 0;
		if (prioA !== prioB) return prioB - prioA;
		return b.daysRequired - a.daysRequired;
	});

	return todayMilestones[0];
}

/**
 * Find all bonds that have an achieved milestone today.
 */
export function getTodayMilestonesForAllBonds(
	bonds: Bond[],
	now: Date = new Date()
): Array<{ bond: Bond; milestone: MilestoneItem }> {
	const results: Array<{ bond: Bond; milestone: MilestoneItem }> = [];
	for (const bond of bonds) {
		const milestone = getTodayMilestoneForBond(bond, now);
		if (milestone) {
			results.push({ bond, milestone });
		}
	}
	return results;
}

/**
 * Tracks the most recently celebrated milestone per bond per calendar day.
 * Only one milestone per bond is stored — a deliberate choice because
 * `getTodayMilestoneForBond` already returns only the highest-priority milestone
 * when multiple coincide on the same day. If that design ever changes, this
 * record should be extended to a Set<milestoneId>.
 */
interface CelebrationHistoryRecord {
	date: string;
	milestoneId: string;
}

let inMemoryHistory: Record<string, CelebrationHistoryRecord> = {};

function getCelebrationHistory(): Record<string, CelebrationHistoryRecord> {
	try {
		if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
			const raw = localStorage.getItem(CELEBRATION_STORAGE_KEY);
			if (raw) return JSON.parse(raw);
		}
	} catch {}
	return inMemoryHistory;
}

/**
 * Checks if a milestone has already been celebrated on today's local calendar day.
 */
export function hasCelebratedMilestoneToday(
	bondId: string,
	milestoneId: string,
	now: Date = new Date()
): boolean {
	const history = getCelebrationHistory();
	const record = history[bondId];
	if (!record) return false;
	const todayStr = toLocalCalendarDateString(now);
	return record.date === todayStr && record.milestoneId === milestoneId;
}

/**
 * Mark a milestone as celebrated for today so it doesn't auto-popup on subsequent app launches today.
 */
export function markCelebratedMilestoneToday(
	bondId: string,
	milestoneId: string,
	now: Date = new Date()
): void {
	const record: CelebrationHistoryRecord = {
		date: toLocalCalendarDateString(now),
		milestoneId
	};
	inMemoryHistory[bondId] = record;

	try {
		if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
			const history = { ...getCelebrationHistory(), [bondId]: record };
			localStorage.setItem(CELEBRATION_STORAGE_KEY, JSON.stringify(history));
		}
	} catch (e) {
		console.warn('Failed to save milestone celebration history to localStorage:', e);
	}
}

/**
 * Clear the celebration history (for testing and dev tools).
 */
export function clearCelebrationHistory(): void {
	inMemoryHistory = {};
	try {
		if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
			localStorage.removeItem(CELEBRATION_STORAGE_KEY);
		}
	} catch {}
}

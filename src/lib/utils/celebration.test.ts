import { describe, it, expect, beforeEach } from 'vitest';
import {
	isSameLocalCalendarDay,
	toLocalCalendarDateString,
	getTodayMilestoneForBond,
	getTodayMilestonesForAllBonds,
	hasCelebratedMilestoneToday,
	markCelebratedMilestoneToday,
	clearCelebrationHistory,
	makePushMilestoneItem
} from './celebration';
import type { Bond } from '$lib/types/bonds';

describe('celebration utils', () => {
	beforeEach(() => {
		clearCelebrationHistory();
	});

	describe('isSameLocalCalendarDay', () => {
		it('returns true for two dates on the exact same local calendar day', () => {
			const d1 = new Date(2025, 4, 15, 8, 30);
			const d2 = new Date(2025, 4, 15, 23, 59);
			expect(isSameLocalCalendarDay(d1, d2)).toBe(true);
		});

		it('returns false for different days', () => {
			const d1 = new Date(2025, 4, 15, 23, 59);
			const d2 = new Date(2025, 4, 16, 0, 1);
			expect(isSameLocalCalendarDay(d1, d2)).toBe(false);
		});
	});

	describe('toLocalCalendarDateString', () => {
		it('formats date as YYYY-MM-DD in local time', () => {
			const date = new Date(2025, 0, 5); // Jan 5, 2025
			expect(toLocalCalendarDateString(date)).toBe('2025-01-05');
		});
	});

	describe('getTodayMilestoneForBond', () => {
		const mockBond: Bond = {
			id: 'bond_1',
			type: 'romantic',
			names: 'Emma & Paul',
			togetherSince: '2024-01-01',
			customMilestones: [],
			notificationsEnabled: true,
			milestonePrefs: {
				years: true,
				months: true,
				days: 'all',
				custom: true
			}
		};

		it('detects a 1-year anniversary milestone on the exact anniversary date', () => {
			const anniversaryDay = new Date(2025, 0, 1, 10, 0); // Jan 1, 2025
			const milestone = getTodayMilestoneForBond(mockBond, anniversaryDay);

			expect(milestone).not.toBeNull();
			expect(milestone?.type).toBe('years');
			expect(milestone?.title).toBe('1 Year Anniversary');
		});

		it('detects a 100-day milestone on the exact 100th day', () => {
			// Jan 1, 2024 + 100 days = April 10, 2024 (leap year)
			const start = new Date(2024, 0, 1);
			const day100 = new Date(start.getTime() + 100 * 24 * 60 * 60 * 1000);

			const milestone = getTodayMilestoneForBond(mockBond, day100);
			expect(milestone).not.toBeNull();
			expect(milestone?.title).toBe('100 Days');
		});

		it('returns null on non-milestone days', () => {
			const randomDay = new Date(2024, 1, 14);
			const milestone = getTodayMilestoneForBond(mockBond, randomDay);
			expect(milestone).toBeNull();
		});

		it('detects custom milestones on their target date', () => {
			const bondWithCustom: Bond = {
				...mockBond,
				customMilestones: [{ id: 'c1', title: 'First Vacation', date: '2024-07-20' }]
			};
			const customDay = new Date(2024, 6, 20); // July 20, 2024
			const milestone = getTodayMilestoneForBond(bondWithCustom, customDay);

			expect(milestone).not.toBeNull();
			expect(milestone?.type).toBe('custom');
			expect(milestone?.title).toBe('First Vacation');
		});
	});

	describe('getTodayMilestonesForAllBonds', () => {
		it('returns all bonds that have a milestone today', () => {
			const bond1: Bond = {
				id: 'bond_1',
				type: 'romantic',
				names: 'Emma & Paul',
				togetherSince: '2024-01-01',
				customMilestones: [],
				notificationsEnabled: true,
				milestonePrefs: { years: true, months: true, days: 'all', custom: true }
			};
			const bond2: Bond = {
				id: 'bond_2',
				type: 'friendship',
				names: 'Emma & Sam',
				togetherSince: '2023-01-01',
				customMilestones: [],
				notificationsEnabled: true,
				milestonePrefs: { years: true, months: true, days: 'all', custom: true }
			};

			const today = new Date(2025, 0, 1); // Jan 1, 2025 (1 year for bond1, 2 years for bond2)
			const results = getTodayMilestonesForAllBonds([bond1, bond2], today);

			expect(results).toHaveLength(2);
			expect(results[0].bond.id).toBe('bond_1');
			expect(results[1].bond.id).toBe('bond_2');
		});
	});

	describe('Celebration history tracking', () => {
		it('tracks whether a milestone was already celebrated today', () => {
			const today = new Date(2025, 0, 1);

			expect(hasCelebratedMilestoneToday('bond_1', 'years_1', today)).toBe(false);

			markCelebratedMilestoneToday('bond_1', 'years_1', today);
			expect(hasCelebratedMilestoneToday('bond_1', 'years_1', today)).toBe(true);

			// Different milestone ID on the same day -> false
			expect(hasCelebratedMilestoneToday('bond_1', 'days_365', today)).toBe(false);

			// Next day -> false
			const tomorrow = new Date(2025, 0, 2);
			expect(hasCelebratedMilestoneToday('bond_1', 'years_1', tomorrow)).toBe(false);
		});
	});

	describe('makePushMilestoneItem', () => {
		it('creates a milestone item with default parameters', () => {
			const item = makePushMilestoneItem('1 Year Anniversary');
			expect(item.id).toBe('push_celebrate');
			expect(item.title).toBe('1 Year Anniversary');
			expect(item.type).toBe('years');
			expect(item.isAchieved).toBe(true);
			expect(item.daysRemaining).toBe(0);
		});

		it('allows custom id and type', () => {
			const item = makePushMilestoneItem('500 Days', 'days_500', 'days');
			expect(item.id).toBe('days_500');
			expect(item.title).toBe('500 Days');
			expect(item.type).toBe('days');
		});
	});
});

import { describe, it, expect, afterEach } from 'vitest';
import { getCalendarDifference, formatLongDate, calculateTimeBreakdown, calculateMilestones } from './time';

describe('getCalendarDifference', () => {
	it('returns zeros for the same date', () => {
		const d = new Date(2024, 0, 15);
		expect(getCalendarDifference(d, d)).toEqual({ years: 0, months: 0, days: 0 });
	});

	it('returns zeros when the end date is before the start date', () => {
		const start = new Date(2024, 5, 1);
		const end = new Date(2024, 0, 1);
		expect(getCalendarDifference(start, end)).toEqual({ years: 0, months: 0, days: 0 });
	});

	it('computes an exact N-year difference with no month/day remainder', () => {
		const start = new Date(2018, 3, 10); // April 10, 2018
		const end = new Date(2023, 3, 10); // April 10, 2023
		expect(getCalendarDifference(start, end)).toEqual({ years: 5, months: 0, days: 0 });
	});

	it('borrows days from the previous month when the day-of-month regresses', () => {
		// 2020-01-15 -> 2021-03-10: 1 year, 1 month, 23 days (Feb 2021 has 28 days).
		const start = new Date(2020, 0, 15);
		const end = new Date(2021, 2, 10);
		expect(getCalendarDifference(start, end)).toEqual({ years: 1, months: 1, days: 23 });
	});

	it('borrows a month when the month regresses after the day-borrow', () => {
		// 2022-11-20 -> 2023-01-05: 0 years, 1 month, 16 days (Dec 2022 has 31 days).
		const start = new Date(2022, 10, 20);
		const end = new Date(2023, 0, 5);
		expect(getCalendarDifference(start, end)).toEqual({ years: 0, months: 1, days: 16 });
	});
});

describe('formatLongDate', () => {
	it('returns an empty string for an empty input', () => {
		expect(formatLongDate('')).toBe('');
	});

	it('formats an ISO date string as a long-form date', () => {
		expect(formatLongDate('2016-01-10')).toBe('January 10, 2016');
	});
});

describe('calculateTimeBreakdown', () => {
	it('returns a fully-zeroed breakdown for an empty start date', () => {
		const breakdown = calculateTimeBreakdown('');
		expect(breakdown.totalDays).toBe(0);
		expect(breakdown.primaryFormatted).toBe('0 days');
		expect(breakdown.startDateFormatted).toBe('');
	});

	it('computes totals and the primary formatted string for a simple 10-day span', () => {
		const now = new Date(2024, 0, 11); // Jan 11 2024, local midnight
		const breakdown = calculateTimeBreakdown('2024-01-01', now, 'en-US');

		expect(breakdown.years).toBe(0);
		expect(breakdown.months).toBe(0);
		expect(breakdown.days).toBe(10);
		expect(breakdown.totalDays).toBe(10);
		expect(breakdown.totalWeeks).toBe(1);
		expect(breakdown.totalHours).toBe(240);
		expect(breakdown.primaryFormatted).toBe('10 days');
		expect(breakdown.startDateFormatted).toBe('January 1, 2024');
	});

	it('joins a full years/months/days breakdown with an Oxford-style "and"', () => {
		// 2020-01-01 -> 2022-09-27 = 2 years, 8 months, 26 days.
		const now = new Date(2022, 8, 27);
		const breakdown = calculateTimeBreakdown('2020-01-01', now);
		expect(breakdown.primaryFormatted).toBe('2 years, 8 months and 26 days');
	});
});

describe('calculateMilestones', () => {
	it('returns empty results for an empty start date', () => {
		expect(calculateMilestones('', [], new Date())).toEqual({ milestones: [], nextMilestone: null });
	});

	it('respects the day filter: "off" excludes all day milestones', () => {
		const { milestones } = calculateMilestones('2024-01-01', [], new Date(2024, 0, 1), {
			years: false,
			months: false,
			days: 'off',
			custom: false
		});
		expect(milestones).toHaveLength(0);
	});

	it('respects the day filter: "major" excludes anything under 1000 days', () => {
		const { milestones } = calculateMilestones('2020-01-01', [], new Date(2020, 0, 1), {
			years: false,
			months: false,
			days: 'major',
			custom: false
		});
		expect(milestones.every((m) => m.daysRequired >= 1000)).toBe(true);
		expect(milestones.some((m) => m.daysRequired === 1000)).toBe(true);
	});

	it('marks milestones achieved/unachieved and picks the correct next milestone with progress', () => {
		const start = '2020-01-01';
		const now = new Date(2020, 0, 1 + 60); // 60 days after the start date

		const { milestones, nextMilestone } = calculateMilestones(start, [], now, {
			years: false,
			months: false,
			days: 'all',
			custom: false
		});

		const day50 = milestones.find((m) => m.id === 'days_50')!;
		const day100 = milestones.find((m) => m.id === 'days_100')!;

		expect(day50.isAchieved).toBe(true);
		expect(day50.daysRemaining).toBe(0);

		expect(day100.isAchieved).toBe(false);
		expect(day100.daysRemaining).toBe(40);

		// Chronological sort: the earliest target date (days_50, already achieved) comes first.
		expect(milestones[0].id).toBe('days_50');

		expect(nextMilestone).not.toBeNull();
		expect(nextMilestone!.milestone.id).toBe('days_100');
		expect(nextMilestone!.daysLeft).toBe(40);
		// totalDaysPassed(60) - prevDays(50) = 10; range = 100 - 50 = 50 -> 20%.
		expect(nextMilestone!.progressPercentage).toBe(20);
	});

	it('includes enabled custom milestones, double-prefixing the display id (see REFACTOR_PLAN.md L2)', () => {
		const { milestones } = calculateMilestones(
			'2024-01-01',
			[{ id: 'custom_123', title: 'First Date', date: '2024-06-01' }],
			new Date(2024, 0, 1),
			{ years: false, months: false, days: 'off', custom: true }
		);

		expect(milestones).toHaveLength(1);
		expect(milestones[0].id).toBe('custom_custom_123');
		expect(milestones[0].title).toBe('First Date');
		// sourceId carries the original Bond.customMilestones id undecorated, so callers
		// can delete by it instead of string-stripping the display id (REFACTOR_PLAN.md L2).
		expect(milestones[0].sourceId).toBe('custom_123');
	});

	it('omits custom milestones entirely when the custom preference is disabled', () => {
		const { milestones } = calculateMilestones(
			'2024-01-01',
			[{ id: 'custom_123', title: 'First Date', date: '2024-06-01' }],
			new Date(2024, 0, 1),
			{ years: false, months: false, days: 'off', custom: false }
		);
		expect(milestones).toHaveLength(0);
	});
});

describe('C1 regression fixture: milestone target dates are local-timezone Date objects (REFACTOR_PLAN.md Critical C1)', () => {
	const originalTZ = process.env.TZ;

	afterEach(() => {
		process.env.TZ = originalTZ;
	});

	function localYMD(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	it('always renders the correct calendar date via local Y/M/D getters, regardless of process TZ', () => {
		process.env.TZ = 'Asia/Tokyo'; // UTC+9 — the exact class of offset that trips C1.
		const { milestones } = calculateMilestones('2024-01-01', [], new Date(2024, 0, 1), {
			years: false,
			months: false,
			days: 'all',
			custom: false
		});
		const day50 = milestones.find((m) => m.id === 'days_50')!;
		expect(localYMD(day50.targetDate)).toBe('2024-02-20');
	});

	it('documents the divergence the scheduler currently relies on comparing via toISOString() (pre-Phase-1-fix)', () => {
		process.env.TZ = 'Asia/Tokyo';
		const { milestones } = calculateMilestones('2024-01-01', [], new Date(2024, 0, 1), {
			years: false,
			months: false,
			days: 'all',
			custom: false
		});
		const day50 = milestones.find((m) => m.id === 'days_50')!;

		// The correct, timezone-independent signal (what the Phase 1 fix should compare
		// against): the target date's own local calendar components.
		const correct = localYMD(day50.targetDate);
		expect(correct).toBe('2024-02-20');

		// What `scheduler.ts:78-81` currently does instead — under a positive UTC-offset
		// server TZ, midnight-local rolls back to the previous day in UTC, so this
		// disagrees with the correct value above. This is precisely Critical finding C1.
		const uncorrectedUTC = day50.targetDate.toISOString().split('T')[0];
		expect(uncorrectedUTC).not.toBe(correct);
		expect(uncorrectedUTC).toBe('2024-02-19');
	});

	it('is invisible under UTC, which is why the bug does not show up on the common Docker default', () => {
		process.env.TZ = 'UTC';
		const { milestones } = calculateMilestones('2024-01-01', [], new Date(2024, 0, 1), {
			years: false,
			months: false,
			days: 'all',
			custom: false
		});
		const day50 = milestones.find((m) => m.id === 'days_50')!;
		expect(day50.targetDate.toISOString().split('T')[0]).toBe(localYMD(day50.targetDate));
	});
});

import type { TimeBreakdown, MilestoneItem, NextMilestoneInfo } from '$lib/types/time';
import type { CustomMilestone } from '$lib/types/profile';

/**
 * Accurately calculate the calendar difference between two dates in years, months, and days.
 */
export function getCalendarDifference(startDate: Date, endDate: Date): { years: number; months: number; days: number } {
	let start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
	let end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

	if (end < start) {
		return { years: 0, months: 0, days: 0 };
	}

	let years = end.getFullYear() - start.getFullYear();
	let months = end.getMonth() - start.getMonth();
	let days = end.getDate() - start.getDate();

	if (days < 0) {
		// Borrow days from the previous month
		const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
		days += prevMonth.getDate();
		months--;
	}

	if (months < 0) {
		months += 12;
		years--;
	}

	return {
		years: Math.max(0, years),
		months: Math.max(0, months),
		days: Math.max(0, days)
	};
}

/**
 * Format date nicely, e.g. "January 10, 2016"
 */
export function formatLongDate(dateStr: string, locale: string = 'en-US'): string {
	if (!dateStr) return '';
	const [year, month, day] = dateStr.split('-').map(Number);
	if (!year || !month || !day) return dateStr;

	const date = new Date(year, month - 1, day);
	return date.toLocaleDateString(locale, {
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
}

/**
 * Calculate comprehensive time breakdown.
 */
export function calculateTimeBreakdown(startDateStr: string, now: Date = new Date(), locale?: string): TimeBreakdown {
	if (!startDateStr) {
		return {
			years: 0,
			months: 0,
			days: 0,
			hours: 0,
			minutes: 0,
			seconds: 0,
			totalMonths: 0,
			totalWeeks: 0,
			totalDays: 0,
			totalHours: 0,
			totalMinutes: 0,
			totalSeconds: 0,
			primaryFormatted: '0 days',
			startDateFormatted: ''
		};
	}

	const [year, month, day] = startDateStr.split('-').map(Number);
	const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);

	const diffMs = Math.max(0, now.getTime() - startDate.getTime());
	const totalSeconds = Math.floor(diffMs / 1000);
	const totalMinutes = Math.floor(totalSeconds / 60);
	const totalHours = Math.floor(totalMinutes / 60);
	const totalDays = Math.floor(totalHours / 24);
	const totalWeeks = Math.floor(totalDays / 7);

	// Calendar breakdown
	const cal = getCalendarDifference(startDate, now);
	const hours = now.getHours();
	const minutes = now.getMinutes();
	const seconds = now.getSeconds();

	// Approximate total months (or calendar years * 12 + months)
	const totalMonths = cal.years * 12 + cal.months;

	// Primary formatted string (like "2 years, 8 months and 26 days" or "10 months and 5 days")
	let primaryFormatted = '';
	const parts: string[] = [];

	if (cal.years > 0) {
		parts.push(`${cal.years} ${cal.years === 1 ? 'year' : 'years'}`);
	}
	if (cal.months > 0) {
		parts.push(`${cal.months} ${cal.months === 1 ? 'month' : 'months'}`);
	}
	if (cal.days > 0 || parts.length === 0) {
		parts.push(`${cal.days} ${cal.days === 1 ? 'day' : 'days'}`);
	}

	if (parts.length === 3) {
		primaryFormatted = `${parts[0]}, ${parts[1]} and ${parts[2]}`;
	} else if (parts.length === 2) {
		primaryFormatted = `${parts[0]} and ${parts[1]}`;
	} else {
		primaryFormatted = parts[0];
	}

	return {
		years: cal.years,
		months: cal.months,
		days: cal.days,
		hours,
		minutes,
		seconds,
		totalMonths,
		totalWeeks,
		totalDays,
		totalHours,
		totalMinutes,
		totalSeconds,
		primaryFormatted,
		startDateFormatted: formatLongDate(startDateStr, locale)
	};
}

/**
 * Standard milestone definitions and calculation.
 */
const STANDARD_DAY_MILESTONES = [
	50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 750, 800, 900, 1000, 1250, 1500, 1750, 2000,
	2500, 3000, 3500, 4000, 5000, 7500, 10000
];

const STANDARD_MONTH_MILESTONES = [
	1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 30, 42, 54, 66, 78, 90, 102, 114
];

const STANDARD_YEAR_MILESTONES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 75];

import type { MilestoneCategoryPrefs } from '$lib/types/bonds';

export function calculateMilestones(
	startDateStr: string,
	customMilestones: CustomMilestone[] = [],
	now: Date = new Date(),
	prefs?: Partial<MilestoneCategoryPrefs>
): { milestones: MilestoneItem[]; nextMilestone: NextMilestoneInfo | null } {
	if (!startDateStr) {
		return { milestones: [], nextMilestone: null };
	}

	const yearsEnabled = prefs?.years ?? true;
	const monthsEnabled = prefs?.months ?? true;
	const daysFilter = prefs?.days ?? 'all';
	const customEnabled = prefs?.custom ?? true;

	const [year, month, day] = startDateStr.split('-').map(Number);
	const startDate = new Date(year, month - 1, day);
	const nowTime = now.getTime();
	const totalDaysPassed = Math.floor(Math.max(0, nowTime - startDate.getTime()) / (1000 * 60 * 60 * 24));

	const milestones: MilestoneItem[] = [];

	// 1. Day milestones
	if (daysFilter !== 'off') {
		for (const days of STANDARD_DAY_MILESTONES) {
			if (daysFilter === 'major' && days < 1000) {
				continue;
			}
			const target = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
			const daysRemaining = Math.ceil((target.getTime() - nowTime) / (1000 * 60 * 60 * 24));
			milestones.push({
				id: `days_${days}`,
				title: `${days.toLocaleString()} Days`,
				daysRequired: days,
				targetDate: target,
				isAchieved: daysRemaining <= 0,
				daysRemaining: Math.max(0, daysRemaining),
				type: 'days',
				iconName: 'Trophy'
			});
		}
	}

	// 2. Month milestones (1 month, 2 months... 6 months, 18 months, etc.)
	if (monthsEnabled) {
		for (const months of STANDARD_MONTH_MILESTONES) {
			const target = new Date(startDate.getFullYear(), startDate.getMonth() + months, startDate.getDate());
			const daysReq = Math.floor((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			const daysRemaining = Math.ceil((target.getTime() - nowTime) / (1000 * 60 * 60 * 24));

			milestones.push({
				id: `months_${months}`,
				title: `${months} ${months === 1 ? 'Month' : 'Months'}`,
				daysRequired: daysReq,
				targetDate: target,
				isAchieved: daysRemaining <= 0,
				daysRemaining: Math.max(0, daysRemaining),
				type: 'months',
				iconName: 'Sparkles'
			});
		}
	}

	// 3. Year anniversaries
	if (yearsEnabled) {
		for (const years of STANDARD_YEAR_MILESTONES) {
			const target = new Date(startDate.getFullYear() + years, startDate.getMonth(), startDate.getDate());
			const daysReq = Math.floor((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			const daysRemaining = Math.ceil((target.getTime() - nowTime) / (1000 * 60 * 60 * 24));

			milestones.push({
				id: `years_${years}`,
				title: `${years} ${years === 1 ? 'Year' : 'Years'} Anniversary`,
				daysRequired: daysReq,
				targetDate: target,
				isAchieved: daysRemaining <= 0,
				daysRemaining: Math.max(0, daysRemaining),
				type: 'years',
				iconName: 'PartyPopper'
			});
		}
	}

	// 4. Custom user milestones
	if (customEnabled) {
		for (const custom of customMilestones) {
			const [cYear, cMonth, cDay] = custom.date.split('-').map(Number);
			const target = new Date(cYear, cMonth - 1, cDay);
			const daysReq = Math.floor((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
			const daysRemaining = Math.ceil((target.getTime() - nowTime) / (1000 * 60 * 60 * 24));

			milestones.push({
				id: `custom_${custom.id}`,
				title: custom.title,
				daysRequired: daysReq,
				targetDate: target,
				isAchieved: daysRemaining <= 0,
				daysRemaining: Math.max(0, daysRemaining),
				type: 'custom',
				iconName: 'HeartHandshake',
				sourceId: custom.id
			});
		}
	}

	// Sort chronologically by target date
	milestones.sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());

	// Find the next upcoming milestone
	const upcoming = milestones.filter((m) => !m.isAchieved);
	let nextMilestone: NextMilestoneInfo | null = null;

	if (upcoming.length > 0) {
		const next = upcoming[0];
		// Find previous milestone days requirement (or 0)
		const achieved = milestones.filter((m) => m.isAchieved);
		const prevDays = achieved.length > 0 ? achieved[achieved.length - 1].daysRequired : 0;
		const totalRange = Math.max(1, next.daysRequired - prevDays);
		const progress = Math.max(0, totalDaysPassed - prevDays);
		const percentage = Math.min(100, Math.max(0, Math.round((progress / totalRange) * 100)));

		nextMilestone = {
			milestone: next,
			progressPercentage: percentage,
			daysLeft: next.daysRemaining
		};
	}

	return { milestones, nextMilestone };
}


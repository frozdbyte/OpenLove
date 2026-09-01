export interface TimeBreakdown {
	years: number;
	months: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	
	// Total cumulative metrics
	totalMonths: number;
	totalWeeks: number;
	totalDays: number;
	totalHours: number;
	totalMinutes: number;
	totalSeconds: number;

	// Formatted primary terms
	primaryFormatted: string; // e.g. "2 years, 8 months and 26 days" or "3 Years"
	startDateFormatted: string; // e.g. "January 10, 2016"
}

export type MilestoneType = 'days' | 'months' | 'years' | 'custom';

export interface MilestoneItem {
	id: string;
	title: string;
	daysRequired: number;
	targetDate: Date;
	isAchieved: boolean;
	daysRemaining: number;
	type: MilestoneType;
	iconName?: string;
	/**
	 * For `type: 'custom'` only: the milestone's own id as stored in
	 * `Bond.customMilestones`, distinct from `id` above (which is `custom_`-prefixed
	 * for display/list-key purposes). Lets callers delete a custom milestone without
	 * string-stripping `id` — see REFACTOR_PLAN.md, Low L2.
	 */
	sourceId?: string;
}

export interface NextMilestoneInfo {
	milestone: MilestoneItem;
	progressPercentage: number;
	daysLeft: number;
}

export interface SWCelebrationMessage {
	type: 'OPENLOVE_SWITCH_BOND';
	bondId: string;
	celebrate?: string;
	milestoneType?: MilestoneType;
	milestoneId?: string;
}

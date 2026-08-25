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

export interface MilestoneItem {
	id: string;
	title: string;
	daysRequired: number;
	targetDate: Date;
	isAchieved: boolean;
	daysRemaining: number;
	type: 'days' | 'months' | 'years' | 'custom';
	iconName?: string;
}

export interface NextMilestoneInfo {
	milestone: MilestoneItem;
	progressPercentage: number;
	daysLeft: number;
}

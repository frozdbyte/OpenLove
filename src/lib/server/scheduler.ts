import { prisma } from './db';
import { sendPushNotification } from './push';
import { calculateMilestones } from '$lib/utils/time';
import type { MilestoneCategoryPrefs } from '$lib/types/bonds';

let isSchedulerRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

function parseBondCategoryPrefs(categoriesStr?: string): MilestoneCategoryPrefs {
	if (!categoriesStr) {
		return { years: true, months: true, days: 'all', custom: true };
	}
	const list = categoriesStr.split(',');
	return {
		years: list.includes('years'),
		months: list.includes('months'),
		days: list.includes('days_all') ? 'all' : list.includes('days_major') ? 'major' : 'off',
		custom: list.includes('custom')
	};
}

/**
 * Check all active subscriptions and dispatch milestone notifications.
 */
export async function checkAndDispatchMilestones(): Promise<{ processed: number; sent: number }> {
	let processed = 0;
	let sent = 0;

	try {
		const subscriptions = await prisma.pushSubscription.findMany({
			include: { bonds: true }
		});
		const nowUTC = new Date();

		for (const sub of subscriptions) {
			processed++;
			try {
				// 1. Resolve subscriber's local date
				let subscriberDateStr = '';
				try {
					const formatter = new Intl.DateTimeFormat('en-CA', {
						timeZone: sub.timezone || 'UTC',
						year: 'numeric',
						month: '2-digit',
						day: '2-digit'
					});
					subscriberDateStr = formatter.format(nowUTC); // YYYY-MM-DD
				} catch {
					subscriberDateStr = nowUTC.toISOString().split('T')[0];
				}

				const [sYear, sMonth, sDay] = subscriberDateStr.split('-').map(Number);
				const localDate = new Date(sYear, sMonth - 1, sDay);

				// 2. Check each bond under this subscription
				const bondsToCheck =
					sub.bonds.length > 0
						? sub.bonds
						: sub.togetherSince
							? [
									{
										id: 'legacy',
										subscriptionId: sub.id,
										bondId: 'primary_bond',
										togetherSince: sub.togetherSince,
										categories: 'years,months,days_all,custom',
										lastNotified: sub.lastNotified,
										createdAt: sub.createdAt,
										updatedAt: sub.updatedAt
									}
								]
							: [];

				for (const bond of bondsToCheck) {
					const prefs = parseBondCategoryPrefs(bond.categories);
					const { milestones } = calculateMilestones(bond.togetherSince, [], localDate, prefs);

					const todayMilestones = milestones.filter((m) => {
						const mTargetStr = m.targetDate.toISOString().split('T')[0];
						return mTargetStr === subscriberDateStr;
					});

					for (const milestone of todayMilestones) {
						const notificationKey = `${subscriberDateStr}:${milestone.id}`;

						if (bond.lastNotified === notificationKey) {
							continue;
						}

						// Universal phrasing that looks natural standalone or with iOS "from Open Love"
						const pushTitle =
							milestone.type === 'years'
								? `Happy ${milestone.title}! ❤️`
								: milestone.type === 'months'
									? `Happy ${milestone.title}! ✨`
									: `${milestone.title} Milestone! 🏆`;

						const pushBody = `Today is a special milestone: ${milestone.title}! 🎉`;

						const result = await sendPushNotification(
							{
								endpoint: sub.endpoint,
								p256dh: sub.p256dh,
								auth: sub.auth
							},
							{
								title: pushTitle,
								body: pushBody,
								type: 'milestone',
								bondId: bond.bondId,
								milestoneId: milestone.id,
								milestoneTitle: milestone.title,
								milestoneType: milestone.type
							}
						);

						if (result.success) {
							sent++;
							if (bond.id !== 'legacy') {
								await prisma.subscriptionBond.update({
									where: { id: bond.id },
									data: { lastNotified: notificationKey }
								});
							} else {
								await prisma.pushSubscription.update({
									where: { id: sub.id },
									data: { lastNotified: notificationKey }
								});
							}
						} else if (result.shouldDelete) {
							// Clean up dead subscription (cascades to all bonds)
							await prisma.pushSubscription.delete({
								where: { id: sub.id }
							});
							break; // subscription is gone
						}
					}
				}
			} catch (subErr) {
				console.error('Error processing subscription milestone:', sub.id, subErr);
			}
		}
	} catch (error) {
		console.error('Error checking milestone scheduler:', error);
	}

	return { processed, sent };
}

/**
 * Start the background scheduler running periodically.
 */
export function startMilestoneScheduler(intervalMs: number = 1000 * 60 * 60): void {
	if (isSchedulerRunning) return;

	isSchedulerRunning = true;
	console.log('🚀 OpenLove milestone scheduler started.');

	// Initial check
	checkAndDispatchMilestones().catch((err) =>
		console.error('Initial scheduler run error:', err)
	);

	// Recurring check
	intervalHandle = setInterval(() => {
		checkAndDispatchMilestones().catch((err) =>
			console.error('Recurring scheduler run error:', err)
		);
	}, intervalMs);

	intervalHandle.unref?.();
}

export function stopMilestoneScheduler(): void {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
	isSchedulerRunning = false;
}

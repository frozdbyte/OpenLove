import { prisma } from './db';
import { sendPushNotification } from './push';
import { calculateMilestones } from '$lib/utils/time';

let isSchedulerRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Check all active subscriptions and dispatch milestone notifications.
 */
export async function checkAndDispatchMilestones(): Promise<{ processed: number; sent: number }> {
	let processed = 0;
	let sent = 0;

	try {
		const subscriptions = await prisma.pushSubscription.findMany();
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

				// 2. Check if today is an exact milestone date
				const { milestones } = calculateMilestones(sub.togetherSince, [], localDate);

				// Find milestones occurring on this exact day
				const todayMilestones = milestones.filter((m) => {
					const mTargetStr = m.targetDate.toISOString().split('T')[0];
					return mTargetStr === subscriberDateStr;
				});

				if (todayMilestones.length === 0) {
					continue;
				}

				for (const milestone of todayMilestones) {
					const notificationKey = `${subscriberDateStr}:${milestone.id}`;

					// Check if already notified for this milestone
					if (sub.lastNotified === notificationKey) {
						continue;
					}

					// Send push notification
					const result = await sendPushNotification(
						{
							endpoint: sub.endpoint,
							p256dh: sub.p256dh,
							auth: sub.auth
						},
						{
							title: `Happy ${milestone.title}! ❤️`,
							body: `Today is a special relationship milestone: ${milestone.title} together! 🎉`,
							type: 'milestone',
							milestoneId: milestone.id,
							milestoneTitle: milestone.title,
							milestoneType: milestone.type
						}
					);

					if (result.success) {
						sent++;
						await prisma.pushSubscription.update({
							where: { id: sub.id },
							data: { lastNotified: notificationKey }
						});
					} else if (result.shouldDelete) {
						// Clean up dead subscription
						await prisma.pushSubscription.delete({
							where: { id: sub.id }
						});
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
}

export function stopMilestoneScheduler(): void {
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
	isSchedulerRunning = false;
}

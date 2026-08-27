import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for REFACTOR_PLAN.md Critical C1: `checkAndDispatchMilestones`
 * used to compare a milestone's target date (a local-timezone `Date`) against the
 * subscriber's local calendar date via `targetDate.toISOString()`, which renders
 * in UTC. Under a server process timezone with a positive UTC offset, that made
 * same-day milestones silently invisible to the scheduler — see `scheduler.ts`'s
 * `toLocalDateString()` for the fix.
 *
 * `./db` and `./push` are mocked (following the same `vi.hoisted` pattern as
 * `sync.test.ts`) so this exercises real scheduling logic without a database or
 * an actual Web Push send.
 */
const { prismaMock, seedSubscriptions, pushMock } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type Row = Record<string, any>;
	let subs: Row[] = [];

	const prismaMock = {
		pushSubscription: {
			async findMany() {
				return subs;
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async update({ where, data }: any) {
				const row = subs.find((s) => s.id === where.id);
				if (!row) throw new Error(`fake prisma: no PushSubscription ${where.id}`);
				Object.assign(row, data);
				return row;
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async delete({ where }: any) {
				subs = subs.filter((s) => s.id !== where.id);
			}
		},
		subscriptionBond: {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async update({ where, data }: any) {
				for (const sub of subs) {
					const bond = (sub.bonds ?? []).find((b: Row) => b.id === where.id);
					if (bond) {
						Object.assign(bond, data);
						return bond;
					}
				}
				throw new Error(`fake prisma: no SubscriptionBond ${where.id}`);
			}
		}
	};

	function seedSubscriptions(rows: Row[]) {
		subs = rows;
	}

	const pushMock = vi.fn(async () => ({ success: true }));

	return { prismaMock, seedSubscriptions, pushMock };
});

vi.mock('./db', () => ({ prisma: prismaMock }));
vi.mock('./push', () => ({ sendPushNotification: pushMock }));

// `vi.mock`/`vi.hoisted` above are hoisted above this import by vitest's transform.
import { checkAndDispatchMilestones } from './scheduler';

describe('checkAndDispatchMilestones — C1 regression (REFACTOR_PLAN.md)', () => {
	const originalTZ = process.env.TZ;

	beforeEach(() => {
		pushMock.mockClear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		process.env.TZ = originalTZ;
	});

	function seedDay50Subscription() {
		seedSubscriptions([
			{
				id: 'sub-1',
				endpoint: 'ep-1',
				p256dh: 'p',
				auth: 'a',
				timezone: 'UTC',
				togetherSince: null,
				lastNotified: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				bonds: [
					{
						id: 'bond-row-1',
						subscriptionId: 'sub-1',
						bondId: 'bond-1',
						// 2024-01-01 + 50 days = 2024-02-20, which is "today" below.
						togetherSince: '2024-01-01',
						categories: 'days_all',
						lastNotified: null,
						createdAt: new Date(),
						updatedAt: new Date()
					}
				]
			}
		]);
	}

	it('detects a same-UTC-day milestone as due even when the server process runs in a positive-UTC-offset timezone', async () => {
		process.env.TZ = 'Asia/Tokyo'; // UTC+9 — exactly the offset class that trips C1.
		vi.setSystemTime(new Date(Date.UTC(2024, 1, 20, 3, 0, 0))); // 2024-02-20, UTC
		seedDay50Subscription();

		const { processed, sent } = await checkAndDispatchMilestones();

		expect(processed).toBe(1);
		expect(sent).toBe(1);
		expect(pushMock).toHaveBeenCalledTimes(1);
		expect(pushMock).toHaveBeenCalledWith(
			expect.objectContaining({ endpoint: 'ep-1' }),
			expect.objectContaining({ milestoneId: 'days_50', bondId: 'bond-1', type: 'milestone' })
		);
	});

	it('still detects the same milestone under UTC (the common Docker default — no regression there)', async () => {
		process.env.TZ = 'UTC';
		vi.setSystemTime(new Date(Date.UTC(2024, 1, 20, 3, 0, 0)));
		seedDay50Subscription();

		const { sent } = await checkAndDispatchMilestones();

		expect(sent).toBe(1);
		expect(pushMock).toHaveBeenCalledTimes(1);
	});

	it('does not re-send a milestone whose notification key is already recorded (idempotency preserved by the fix)', async () => {
		process.env.TZ = 'Asia/Tokyo';
		vi.setSystemTime(new Date(Date.UTC(2024, 1, 20, 3, 0, 0)));
		// Seed directly with lastNotified pre-set, simulating a prior successful run
		// having already recorded today's notification for this bond.
		seedSubscriptions([
			{
				id: 'sub-1',
				endpoint: 'ep-1',
				p256dh: 'p',
				auth: 'a',
				timezone: 'UTC',
				togetherSince: null,
				lastNotified: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				bonds: [
					{
						id: 'bond-row-1',
						subscriptionId: 'sub-1',
						bondId: 'bond-1',
						togetherSince: '2024-01-01',
						categories: 'days_all',
						lastNotified: '2024-02-20:days_50',
						createdAt: new Date(),
						updatedAt: new Date()
					}
				]
			}
		]);

		const { sent } = await checkAndDispatchMilestones();

		expect(sent).toBe(0);
		expect(pushMock).not.toHaveBeenCalled();
	});
});

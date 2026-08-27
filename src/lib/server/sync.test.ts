import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncDeleteOp, SyncUpsertOp } from '$lib/types/sync';

/**
 * `applySyncOps` (server/sync.ts) only depends on the `prisma` singleton imported
 * from `./db`. `./db` itself opens a real SQLite file as a side effect of being
 * imported (see `createPrismaClient()`), so it is mocked here with an in-memory
 * fake that implements just the subset of the Prisma Client surface this module
 * calls — enough to exercise the last-write-wins / endpoint-rotation branching
 * without touching a real database.
 *
 * `vi.hoisted` is required because `vi.mock` factories are hoisted above all
 * imports; the fake client has to exist before that hoisted factory runs.
 */
const { prismaMock, resetPrismaMock } = vi.hoisted(() => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type Row = Record<string, any>;

	function createFakePrisma() {
		const subs = new Map<string, Row>();
		const bonds = new Map<string, Row>();
		let idCounter = 0;
		const nextId = () => `id_${++idCounter}`;

		const findSubByEndpoint = (endpoint: string) =>
			[...subs.values()].find((s) => s.endpoint === endpoint) ?? null;

		const client = {
			pushSubscription: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async findUnique({ where }: any) {
					if (where.endpoint !== undefined) return findSubByEndpoint(where.endpoint);
					if (where.id !== undefined) return subs.get(where.id) ?? null;
					return null;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async update({ where, data }: any) {
					const row = subs.get(where.id);
					if (!row) throw new Error(`fake prisma: no PushSubscription with id ${where.id}`);
					Object.assign(row, data, { updatedAt: new Date() });
					return row;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async create({ data }: any) {
					const row: Row = {
						id: nextId(),
						lastNotified: null,
						createdAt: new Date(),
						updatedAt: new Date(),
						...data
					};
					subs.set(row.id, row);
					return row;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async delete({ where }: any) {
					const row = subs.get(where.id) ?? null;
					subs.delete(where.id);
					for (const [bondRowId, bondRow] of [...bonds.entries()]) {
						if (bondRow.subscriptionId === where.id) bonds.delete(bondRowId);
					}
					return row;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async deleteMany({ where }: any) {
					let count = 0;
					for (const [id, row] of [...subs.entries()]) {
						const matchesEndpoint = where.endpoint === undefined || row.endpoint === where.endpoint;
						const excluded = where.NOT?.id !== undefined && row.id === where.NOT.id;
						if (matchesEndpoint && !excluded) {
							subs.delete(id);
							count++;
						}
					}
					return { count };
				}
			},
			subscriptionBond: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async findUnique({ where }: any) {
					const key = where.subscriptionId_bondId;
					if (!key) return null;
					return (
						[...bonds.values()].find(
							(b) => b.subscriptionId === key.subscriptionId && b.bondId === key.bondId
						) ?? null
					);
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async update({ where, data }: any) {
					const row = bonds.get(where.id);
					if (!row) throw new Error(`fake prisma: no SubscriptionBond with id ${where.id}`);
					Object.assign(row, data, { updatedAt: new Date() });
					return row;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async create({ data }: any) {
					const row: Row = {
						id: nextId(),
						lastNotified: null,
						createdAt: new Date(),
						updatedAt: new Date(),
						...data
					};
					bonds.set(row.id, row);
					return row;
				},
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async deleteMany({ where }: any) {
					let count = 0;
					for (const [id, row] of [...bonds.entries()]) {
						if (row.subscriptionId !== where.subscriptionId) continue;
						const notIn: string[] | undefined = where.bondId?.notIn;
						if (notIn && notIn.includes(row.bondId)) continue;
						bonds.delete(id);
						count++;
					}
					return { count };
				}
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async $transaction(fn: (tx: any) => Promise<any>) {
				return fn(client);
			},
			__debug: { subs, bonds }
		};

		return client;
	}

	const prismaMock = createFakePrisma();
	function resetPrismaMock() {
		prismaMock.__debug.subs.clear();
		prismaMock.__debug.bonds.clear();
	}
	return { prismaMock, resetPrismaMock };
});

vi.mock('./db', () => ({ prisma: prismaMock }));

// `vi.mock`/`vi.hoisted` calls above are hoisted above this import by vitest's
// transform, so `applySyncOps` resolves against the mocked `./db` at runtime.
import { applySyncOps } from './sync';

function upsertOp(overrides: Partial<SyncUpsertOp> & { endpoint: string }): SyncUpsertOp {
	return {
		opId: `op_${Math.random().toString(36).slice(2)}`,
		kind: 'upsert',
		clientUpdatedAt: '2024-01-01T00:00:00.000Z',
		keys: { p256dh: 'p', auth: 'a' },
		bonds: [],
		timezone: 'UTC',
		...overrides
	};
}

function deleteOp(overrides: Partial<SyncDeleteOp> & { endpoint: string }): SyncDeleteOp {
	return {
		opId: `op_${Math.random().toString(36).slice(2)}`,
		kind: 'delete',
		clientUpdatedAt: '2024-01-01T00:00:00.000Z',
		...overrides
	};
}

beforeEach(() => {
	resetPrismaMock();
});

describe('applySyncOps — upsert, no rotation', () => {
	it('creates a new subscription and its bonds when none exists for the endpoint', async () => {
		const op = upsertOp({
			endpoint: 'ep-1',
			togetherSince: '2024-01-01',
			bonds: [{ bondId: 'bond-1', togetherSince: '2024-01-01', categories: ['years'] }]
		});

		const [result] = await applySyncOps([op]);

		expect(result).toEqual({ opId: op.opId, status: 'applied' });
		const row = [...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'ep-1');
		expect(row).toBeTruthy();
		expect(row!.timezone).toBe('UTC');
		const bondRows = [...prismaMock.__debug.bonds.values()].filter((b) => b.subscriptionId === row!.id);
		expect(bondRows).toHaveLength(1);
		expect(bondRows[0].bondId).toBe('bond-1');
	});

	it('applies a newer upsert over an existing row and diffs bonds (add/update/remove)', async () => {
		await applySyncOps([
			upsertOp({
				endpoint: 'ep-1',
				clientUpdatedAt: '2024-01-01T00:00:00.000Z',
				bonds: [
					{ bondId: 'keep', togetherSince: '2024-01-01', categories: ['years'] },
					{ bondId: 'drop', togetherSince: '2024-01-01', categories: ['years'] }
				]
			})
		]);

		const [result] = await applySyncOps([
			upsertOp({
				endpoint: 'ep-1',
				clientUpdatedAt: '2024-02-01T00:00:00.000Z',
				timezone: 'Europe/Berlin',
				bonds: [
					{ bondId: 'keep', togetherSince: '2024-06-15', categories: ['years', 'months'] },
					{ bondId: 'new', togetherSince: '2024-07-01', categories: ['custom'] }
				]
			})
		]);

		expect(result.status).toBe('applied');
		const row = [...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'ep-1');
		expect(row!.timezone).toBe('Europe/Berlin');

		const bondRows = [...prismaMock.__debug.bonds.values()].filter((b) => b.subscriptionId === row!.id);
		const byBondId = Object.fromEntries(bondRows.map((b) => [b.bondId, b]));
		expect(Object.keys(byBondId).sort()).toEqual(['keep', 'new']); // 'drop' removed
		expect(byBondId['keep'].togetherSince).toBe('2024-06-15');
		expect(byBondId['keep'].categories).toBe('years,months');
		expect(byBondId['new'].togetherSince).toBe('2024-07-01');
	});

	it('rejects an upsert older than the existing row as stale, without mutating it', async () => {
		await applySyncOps([
			upsertOp({ endpoint: 'ep-1', clientUpdatedAt: '2024-06-01T00:00:00.000Z', timezone: 'UTC' })
		]);

		const [result] = await applySyncOps([
			upsertOp({ endpoint: 'ep-1', clientUpdatedAt: '2024-01-01T00:00:00.000Z', timezone: 'America/New_York' })
		]);

		expect(result.status).toBe('stale');
		const row = [...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'ep-1');
		expect(row!.timezone).toBe('UTC'); // unchanged
	});
});

describe('applySyncOps — upsert with endpoint rotation (oldEndpoint)', () => {
	it('migrates the existing row in place, preserving lastNotified', async () => {
		await applySyncOps([
			upsertOp({ endpoint: 'old-ep', clientUpdatedAt: '2024-01-01T00:00:00.000Z' })
		]);
		const previousRow = [...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'old-ep');
		previousRow!.lastNotified = '2024-06-01:days_50'; // simulate a prior notification

		const [result] = await applySyncOps([
			upsertOp({
				endpoint: 'new-ep',
				oldEndpoint: 'old-ep',
				clientUpdatedAt: '2024-07-01T00:00:00.000Z'
			})
		]);

		expect(result.status).toBe('applied');
		expect(prismaMock.__debug.subs.size).toBe(1); // migrated in place, not duplicated
		const row = [...prismaMock.__debug.subs.values()][0];
		expect(row.endpoint).toBe('new-ep');
		expect(row.lastNotified).toBe('2024-06-01:days_50'); // survives the rotation
		expect([...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'old-ep')).toBeUndefined();
	});

	it('rejects a rotation older than the row it targets as stale, and does not migrate it', async () => {
		await applySyncOps([
			upsertOp({ endpoint: 'old-ep', clientUpdatedAt: '2024-06-01T00:00:00.000Z' })
		]);

		const [result] = await applySyncOps([
			upsertOp({
				endpoint: 'new-ep',
				oldEndpoint: 'old-ep',
				clientUpdatedAt: '2024-01-01T00:00:00.000Z'
			})
		]);

		expect(result.status).toBe('stale');
		expect([...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'old-ep')).toBeTruthy();
		expect([...prismaMock.__debug.subs.values()].find((s) => s.endpoint === 'new-ep')).toBeUndefined();
	});

	it('falls back to a plain create when the named oldEndpoint does not exist', async () => {
		const [result] = await applySyncOps([
			upsertOp({ endpoint: 'fresh-ep', oldEndpoint: 'never-existed' })
		]);

		expect(result.status).toBe('applied');
		expect(prismaMock.__debug.subs.size).toBe(1);
		expect([...prismaMock.__debug.subs.values()][0].endpoint).toBe('fresh-ep');
	});
});

describe('applySyncOps — delete', () => {
	it('is idempotent: deleting an endpoint that is already gone reports applied', async () => {
		const [result] = await applySyncOps([deleteOp({ endpoint: 'never-existed' })]);
		expect(result.status).toBe('applied');
	});

	it('deletes an existing subscription (cascading its bonds)', async () => {
		await applySyncOps([
			upsertOp({
				endpoint: 'ep-1',
				clientUpdatedAt: '2024-01-01T00:00:00.000Z',
				bonds: [{ bondId: 'b1', togetherSince: '2024-01-01', categories: ['years'] }]
			})
		]);

		const [result] = await applySyncOps([
			deleteOp({ endpoint: 'ep-1', clientUpdatedAt: '2024-02-01T00:00:00.000Z' })
		]);

		expect(result.status).toBe('applied');
		expect(prismaMock.__debug.subs.size).toBe(0);
		expect(prismaMock.__debug.bonds.size).toBe(0);
	});

	it('rejects a delete older than the row it targets as stale, and does not delete it (queued-before-resubscribe case)', async () => {
		await applySyncOps([
			upsertOp({ endpoint: 'ep-1', clientUpdatedAt: '2024-06-01T00:00:00.000Z' })
		]);

		const [result] = await applySyncOps([
			deleteOp({ endpoint: 'ep-1', clientUpdatedAt: '2024-01-01T00:00:00.000Z' })
		]);

		expect(result.status).toBe('stale');
		expect(prismaMock.__debug.subs.size).toBe(1);
	});
});

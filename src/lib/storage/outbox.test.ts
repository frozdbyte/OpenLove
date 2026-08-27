import { describe, it, expect } from 'vitest';
import { coalesce } from './outbox';
import type { SyncDeleteOp, SyncUpsertOp } from '$lib/types/sync';

/**
 * `coalesce()` is pure and side-effect-free — it is the one piece of the outbox
 * that is safe to unit test without touching IndexedDB. `createStore()` from
 * idb-keyval (used elsewhere in this module) is lazy and never touches the
 * `indexedDB` global until a CRUD call is actually made, so importing this
 * module here is safe as long as we only exercise `coalesce()`.
 */

function upsert(overrides: Partial<SyncUpsertOp> & { endpoint: string }): SyncUpsertOp {
	return {
		opId: `op_${Math.random().toString(36).slice(2)}`,
		kind: 'upsert',
		clientUpdatedAt: '2024-01-01T00:00:00.000Z',
		keys: { p256dh: 'p', auth: 'a' },
		bonds: [],
		timezone: 'UTC',
		attempts: 0,
		...overrides
	};
}

function del(overrides: Partial<SyncDeleteOp> & { endpoint: string }): SyncDeleteOp {
	return {
		opId: `op_${Math.random().toString(36).slice(2)}`,
		kind: 'delete',
		clientUpdatedAt: '2024-01-01T00:00:00.000Z',
		attempts: 0,
		...overrides
	};
}

describe('coalesce', () => {
	it('returns an empty array for an empty queue', () => {
		expect(coalesce([])).toEqual([]);
	});

	it('passes a single op through unchanged', () => {
		const op = upsert({ endpoint: 'A', togetherSince: '2024-01-01' });
		expect(coalesce([op])).toEqual([op]);
	});

	it('keeps only the newest upsert per endpoint (nudging a date picker 40x collapses to 1 op)', () => {
		const ops = Array.from({ length: 40 }, (_, i) =>
			upsert({ endpoint: 'A', togetherSince: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` })
		);
		const result = coalesce(ops);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(ops[ops.length - 1]);
	});

	it('lets a delete supersede every earlier op for the same endpoint', () => {
		const ops = [
			upsert({ endpoint: 'A', togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'A', togetherSince: '2024-02-01' }),
			del({ endpoint: 'A' })
		];
		const result = coalesce(ops);
		expect(result).toHaveLength(1);
		expect(result[0].kind).toBe('delete');
	});

	it('lets a later upsert (re-subscribe) win over an earlier delete for the same endpoint', () => {
		const ops = [del({ endpoint: 'A' }), upsert({ endpoint: 'A', togetherSince: '2024-03-01' })];
		const result = coalesce(ops);
		expect(result).toHaveLength(1);
		expect(result[0].kind).toBe('upsert');
		expect((result[0] as SyncUpsertOp).togetherSince).toBe('2024-03-01');
	});

	it('carries oldEndpoint forward when a later upsert for the same endpoint does not name one itself', () => {
		const ops = [
			upsert({ endpoint: 'B', oldEndpoint: 'A', togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'B', togetherSince: '2024-02-01' }) // no oldEndpoint of its own
		];
		const result = coalesce(ops) as SyncUpsertOp[];
		expect(result).toHaveLength(1);
		expect(result[0].endpoint).toBe('B');
		expect(result[0].oldEndpoint).toBe('A');
		expect(result[0].togetherSince).toBe('2024-02-01');
	});

	it('lets an explicit oldEndpoint on the later op override the carried-forward one', () => {
		const ops = [
			upsert({ endpoint: 'B', oldEndpoint: 'A', togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'B', oldEndpoint: 'Z', togetherSince: '2024-02-01' })
		];
		const result = coalesce(ops) as SyncUpsertOp[];
		expect(result[0].oldEndpoint).toBe('Z');
	});

	it('drops a queued op for an endpoint a surviving upsert is migrating away from', () => {
		// A change queued against the pre-rotation endpoint ('A') must not resurrect that
		// row once a migration to 'B' is also queued.
		const ops = [
			upsert({ endpoint: 'A', togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'B', oldEndpoint: 'A', togetherSince: '2024-02-01' })
		];
		const result = coalesce(ops);
		expect(result).toHaveLength(1);
		expect(result[0].endpoint).toBe('B');
	});

	it('does not drop the migrated-away endpoint if it is not actually a migration (oldEndpoint === endpoint)', () => {
		const ops = [upsert({ endpoint: 'A', oldEndpoint: 'A', togetherSince: '2024-01-01' })];
		const result = coalesce(ops);
		expect(result).toHaveLength(1);
		expect(result[0].endpoint).toBe('A');
	});

	it('keeps ops for distinct endpoints independent', () => {
		const ops = [
			upsert({ endpoint: 'A', togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'B', togetherSince: '2024-02-01' }),
			del({ endpoint: 'C' })
		];
		const result = coalesce(ops);
		expect(result).toHaveLength(3);
		const byEndpoint = Object.fromEntries(result.map((op) => [op.endpoint, op]));
		expect(byEndpoint['A'].kind).toBe('upsert');
		expect(byEndpoint['B'].kind).toBe('upsert');
		expect(byEndpoint['C'].kind).toBe('delete');
	});

	it('carries forward the highest attempts count seen for an endpoint', () => {
		const ops = [
			upsert({ endpoint: 'A', attempts: 3, togetherSince: '2024-01-01' }),
			upsert({ endpoint: 'A', attempts: 1, togetherSince: '2024-02-01' })
		];
		const result = coalesce(ops) as SyncUpsertOp[];
		expect(result[0].attempts).toBe(3);
	});
});

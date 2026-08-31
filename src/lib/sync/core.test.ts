import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `flushOutbox()` touches IndexedDB via `$lib/storage/outbox` (idb-keyval), which
 * this project's `vitest.config.ts` deliberately runs without a DOM/IndexedDB
 * environment for (see its own comment). So the outbox module is fully mocked
 * here — these tests exercise only `flushOutbox()`'s own logic (the fetch
 * try/catch, status-code branching, and the resulting `FlushResult.reason`
 * classification), not persistence, which `outbox.test.ts` already covers for
 * the one pure piece of that module (`coalesce()`).
 */
const {
	listOpsMock,
	replaceOpsMock,
	getRetryStateMock,
	recordFailureMock,
	recordSuccessMock,
	countOpsMock
} = vi.hoisted(() => ({
	listOpsMock: vi.fn(),
	replaceOpsMock: vi.fn(),
	getRetryStateMock: vi.fn(),
	recordFailureMock: vi.fn(),
	recordSuccessMock: vi.fn(),
	countOpsMock: vi.fn()
}));

vi.mock('$lib/storage/outbox', () => ({
	MAX_ATTEMPTS: 8,
	listOps: listOpsMock,
	replaceOps: replaceOpsMock,
	getRetryState: getRetryStateMock,
	recordFailure: recordFailureMock,
	recordSuccess: recordSuccessMock,
	countOps: countOpsMock,
	newOpId: () => 'mock-op-id',
	// Coalescing itself is covered in `outbox.test.ts`; identity keeps these
	// tests focused on the fetch/response handling in `flushOutbox()`.
	coalesce: (ops: unknown[]) => ops
}));

import { flushOutbox } from './core';
import type { SyncUpsertOp } from '$lib/types/sync';

function upsert(overrides: Partial<SyncUpsertOp> & { endpoint: string }): SyncUpsertOp {
	return {
		opId: 'op1',
		kind: 'upsert',
		clientUpdatedAt: '2024-01-01T00:00:00.000Z',
		keys: { p256dh: 'p', auth: 'a' },
		bonds: [],
		timezone: 'UTC',
		attempts: 0,
		...overrides
	};
}

describe('flushOutbox failure classification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listOpsMock.mockResolvedValue([upsert({ endpoint: 'A' })]);
		getRetryStateMock.mockResolvedValue({ nextAttemptAt: 0, consecutiveFailures: 0 });
		replaceOpsMock.mockResolvedValue(undefined);
		recordFailureMock.mockResolvedValue(undefined);
		recordSuccessMock.mockResolvedValue(undefined);
		countOpsMock.mockResolvedValue(1);
	});

	it('reports client-offline when fetch throws and the browser reports no connection', async () => {
		vi.stubGlobal('navigator', { onLine: false });
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network error')));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('client-offline');
		expect(result.failed).toBe(1);
		expect(recordFailureMock).toHaveBeenCalled();
	});

	it('reports server-unreachable when fetch throws but the browser reports a live connection', async () => {
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network error')));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
	});

	it('reports server-unreachable when fetch throws and navigator is unavailable', async () => {
		vi.stubGlobal('navigator', undefined);
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network error')));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
	});

	it('reports server-unreachable on a retryable 5xx response', async () => {
		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
		expect(result.failed).toBe(1);
	});

	it('reports server-unreachable on 429', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
	});

	it('drops the op with no failure reason on a permanent 4xx', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBeUndefined();
		expect(result.dropped).toBe(1);
		expect(result.failed).toBe(0);
		expect(recordSuccessMock).toHaveBeenCalled();
	});

	it('reports server-unreachable when an ok response has an unparseable body', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => {
					throw new Error('bad json');
				}
			})
		);

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
	});

	it('reports server-unreachable when per-op results leave ops pending after a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ results: [{ opId: 'op1', status: 'error' }] })
			})
		);

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBe('server-unreachable');
		expect(result.failed).toBe(1);
	});

	it('has no failure reason on success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ results: [{ opId: 'op1', status: 'applied' }] })
			})
		);

		const result = await flushOutbox({ force: true });

		expect(result.reason).toBeUndefined();
		expect(result.flushed).toBe(1);
		expect(recordSuccessMock).toHaveBeenCalled();
	});
});

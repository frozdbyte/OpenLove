import {
	MAX_ATTEMPTS,
	coalesce,
	countOps,
	getRetryState,
	listOps,
	newOpId,
	recordFailure,
	recordSuccess,
	replaceOps
} from '$lib/storage/outbox';
import type {
	FlushResult,
	SyncKeys,
	SyncOp,
	SyncResponse,
	SyncUpsertOp
} from '$lib/types/sync';

/**
 * Outbox delivery. DOM-free on purpose: `src/service-worker.ts` imports this.
 */

export const SYNC_ENDPOINT = '/api/push/sync';
export const SYNC_TAG = 'openlove-sync';

const NO_OP: FlushResult = { flushed: 0, failed: 0, dropped: 0, skipped: true };

type FlushListener = (result: FlushResult, pending: number) => void;

const listeners = new Set<FlushListener>();
let inFlight: Promise<FlushResult> | null = null;

export function onFlush(listener: FlushListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function emit(result: FlushResult) {
	const pending = await countOps().catch(() => 0);
	for (const listener of listeners) {
		try {
			listener(result, pending);
		} catch (err) {
			console.error('[sync] flush listener threw:', err);
		}
	}
}

export function buildUpsert(
	input: {
		endpoint: string;
		keys: SyncKeys;
		togetherSince: string;
		timezone: string;
		oldEndpoint?: string;
	}
): SyncUpsertOp {
	return {
		opId: newOpId(),
		kind: 'upsert',
		clientUpdatedAt: new Date().toISOString(),
		endpoint: input.endpoint,
		keys: input.keys,
		togetherSince: input.togetherSince,
		timezone: input.timezone,
		...(input.oldEndpoint && input.oldEndpoint !== input.endpoint
			? { oldEndpoint: input.oldEndpoint }
			: {}),
		attempts: 0
	};
}

export function resolveTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

/**
 * Deliver everything in the outbox in a single request.
 *
 * `navigator.onLine` is deliberately not consulted — it reports `true` behind
 * captive portals. The authoritative signal is whether the fetch succeeded, and
 * because every op is idempotent server-side we can just try and let failures
 * re-queue.
 */
export async function flushOutbox(opts: { force?: boolean } = {}): Promise<FlushResult> {
	if (inFlight) return inFlight;

	inFlight = (async (): Promise<FlushResult> => {
		const queued = await listOps();
		// Still emit on the no-op paths: the pending count is how the UI knows what is
		// queued, and it changes on enqueue even when no delivery is attempted.
		if (queued.length === 0) return await noop();

		if (!opts.force) {
			const retry = await getRetryState();
			if (retry.nextAttemptAt > Date.now()) return await noop();
		}

		// Shrink the queue even if we end up offline — coalescing is pure local work.
		const ops = coalesce(queued);
		if (ops.length !== queued.length) {
			await replaceOps(ops);
		}

		let response: Response;
		try {
			response = await fetch(SYNC_ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ops: ops.map(stripLocalFields) })
			});
		} catch {
			// Offline, DNS failure, captive portal. Keep everything and back off.
			return await failAll(ops);
		}

		if (!response.ok) {
			const retryable =
				response.status >= 500 || response.status === 408 || response.status === 429;
			if (retryable) {
				return await failAll(ops);
			}
			// Any other 4xx means this payload will never be accepted. Dropping it is
			// better than retrying forever; the next real mutation re-queues a fresh op.
			console.error(
				`[sync] dropping ${ops.length} op(s) after permanent HTTP ${response.status}`
			);
			await replaceOps([]);
			await recordSuccess();
			const result: FlushResult = {
				flushed: 0,
				failed: 0,
				dropped: ops.length,
				skipped: false
			};
			await emit(result);
			return result;
		}

		let body: SyncResponse;
		try {
			body = await response.json();
		} catch {
			return await failAll(ops);
		}

		const statusByOpId = new Map((body.results ?? []).map((r) => [r.opId, r]));
		const remaining: SyncOp[] = [];
		let flushed = 0;
		let dropped = 0;

		for (const op of ops) {
			const result = statusByOpId.get(op.opId);

			// 'stale' means a newer change from another device already won. Nothing
			// left to do, so it is as settled as 'applied'.
			if (!result || result.status === 'applied' || result.status === 'stale') {
				flushed++;
				continue;
			}

			const attempts = (op.attempts ?? 0) + 1;
			if (result.permanent || attempts >= MAX_ATTEMPTS) {
				console.error(
					`[sync] dropping op ${op.opId} (${op.kind}) after ${attempts} attempt(s):`,
					result.message ?? 'permanent server error'
				);
				dropped++;
				continue;
			}
			remaining.push({ ...op, attempts });
		}

		await replaceOps(remaining);
		if (remaining.length > 0) {
			await recordFailure();
		} else {
			await recordSuccess();
		}

		const result: FlushResult = {
			flushed,
			failed: remaining.length,
			dropped,
			skipped: false
		};
		await emit(result);
		return result;
	})();

	try {
		return await inFlight;
	} finally {
		inFlight = null;
	}
}

async function noop(): Promise<FlushResult> {
	await emit(NO_OP);
	return NO_OP;
}

async function failAll(ops: SyncOp[]): Promise<FlushResult> {
	const remaining: SyncOp[] = [];
	let dropped = 0;

	for (const op of ops) {
		const attempts = (op.attempts ?? 0) + 1;
		if (attempts >= MAX_ATTEMPTS) {
			console.error(`[sync] dropping op ${op.opId} after ${attempts} failed attempts`);
			dropped++;
			continue;
		}
		remaining.push({ ...op, attempts });
	}

	await replaceOps(remaining);
	await recordFailure();

	const result: FlushResult = {
		flushed: 0,
		failed: remaining.length,
		dropped,
		skipped: false
	};
	await emit(result);
	return result;
}

/** `attempts` is bookkeeping for the client; the server has no use for it. */
function stripLocalFields(op: SyncOp): SyncOp {
	const { attempts: _attempts, ...wire } = op;
	return wire as SyncOp;
}
